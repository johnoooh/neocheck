"""Claude chat client for multi-turn conversations with MCP tool use.

Extends the single-shot analysis pattern to support persistent chat sessions
with conversation history and context awareness.
"""

import asyncio
import json
import logging
from typing import Any, Callable

import anthropic

from clients.mcp_manager import MCPManager

logger = logging.getLogger(__name__)


def format_results_for_chat(results: dict[str, Any]) -> str:
    """Convert analysis results into comprehensive context for chat.

    Includes all data from the prior API calls so the AI doesn't need to re-query.
    """
    gene = results.get("gene", "unknown")
    mutation = results.get("mutation", "unknown")
    hla_alleles = results.get("hla_alleles", [])

    lines = [
        f"## Patient Context: {gene} {mutation}",
        f"**HLA alleles:** {', '.join(hla_alleles)}",
        "",
        "### Scoring System (0-100 points)",
        "- T-cell assay count: 0-25 pts (log scale: 1=5pts, 5=15pts, 10+=25pts)",
        "- Positive assay ratio: 0-20 pts (% of assays with positive T-cell response)",
        "- TCR sequences: 0-20 pts (known T-cell receptor data)",
        "- PDB structure: 0-10 pts (3D structural data available)",
        "- MHC ligand assays: 0-15 pts (peptide-MHC binding evidence)",
        "- HLA match bonus: +10 pts (epitope matches patient's HLA type)",
        "",
        "The following data was retrieved from database searches. Use this information to answer questions without re-querying unless the user asks for additional/different data.",
        "",
    ]

    # Full epitope data
    epitope_data = results.get("epitopes", {})
    epitopes = epitope_data.get("epitopes", [])
    lines.append(f"### Epitope Search Results ({epitope_data.get('total_count', 0)} total, "
                 f"{epitope_data.get('hla_matched_count', 0)} HLA-matched)")
    lines.append("")

    # Get detailed epitope data for positive/negative counts
    detailed_epitopes = results.get("detailed_epitopes", [])

    # Include ALL epitopes with full details
    for i, ep in enumerate(epitopes, 1):
        seq = ep.get("linear_sequence", "N/A")
        structure_id = ep.get("structure_id", "N/A")
        alleles = ", ".join(ep.get("mhc_alleles") or ["N/A"])
        matched = " **[HLA MATCH]**" if ep.get("hla_matched") else ""
        tcell = ep.get("tcell_assay_count", 0)
        tcr = ep.get("tcr_count", 0)
        mhc_ligand = ep.get("mhc_ligand_count", 0)
        score = ep.get("score", 0)

        # Get positive/negative counts from detailed_epitopes if available
        pos, neg = 0, 0
        for d in detailed_epitopes:
            if d.get("epitope", {}).get("structure_id") == structure_id:
                for a in d.get("tcell_assays", []):
                    qm = a.get("qualitative_measure", "") or ""
                    if qm.startswith("Positive"):
                        pos += 1
                    elif qm == "Negative":
                        neg += 1
                break

        lines.append(f"**{i}. `{seq}`** (CEDAR ID: {structure_id}){matched}")
        lines.append(f"   - MHC restriction: {alleles}")
        if pos or neg:
            lines.append(f"   - T-cell assays: {tcell} (Positive: {pos}, Negative: {neg})")
        else:
            lines.append(f"   - T-cell assays: {tcell}")
        lines.append(f"   - TCR sequences: {tcr} | MHC ligand assays: {mhc_ligand}")
        lines.append(f"   - Composite score: {score}/100")
        lines.append("")

    # Full clinical trials data
    trials = results.get("trials", [])
    if trials:
        lines.append(f"### Clinical Trials ({len(trials)} found)")
        lines.append("")
        for t in trials:
            nct = t.get("nct_id", "N/A")
            title = t.get("title", "N/A")
            status = t.get("status", "N/A")
            phase = t.get("phase", "N/A")
            conditions = ", ".join(t.get("conditions", [])[:3]) if t.get("conditions") else "N/A"
            lines.append(f"**{nct}**: {title}")
            lines.append(f"   - Status: {status} | Phase: {phase}")
            lines.append(f"   - Conditions: {conditions}")
            lines.append("")
    else:
        lines.append("### Clinical Trials: None found")
        lines.append("")

    # Full publications data
    pubs = results.get("publications", [])
    if pubs:
        lines.append(f"### Publications ({len(pubs)} found)")
        lines.append("")
        for p in pubs:
            pmid = p.get("pmid", "N/A")
            title = p.get("title", "N/A")
            authors = p.get("authors", "N/A")
            journal = p.get("journal", "N/A")
            year = p.get("year", "N/A")
            lines.append(f"**PMID {pmid}**: {title}")
            lines.append(f"   - Authors: {authors[:100]}{'...' if len(str(authors)) > 100 else ''}")
            lines.append(f"   - {journal} ({year})")
            lines.append("")
    else:
        lines.append("### Publications: None found")
        lines.append("")

    # HLA validation results if present (hla_info is a list of dicts)
    hla_info = results.get("hla_info", [])
    if hla_info:
        lines.append("### HLA Validation")
        for info in hla_info:
            if info:
                name = info.get("name", info.get("allele", "Unknown"))
                status = "✓ Valid" if info.get("valid") else "✗ Invalid"
                lines.append(f"- {name}: {status}")
        lines.append("")

    return "\n".join(lines)


class ChatAnalyzer:
    """Handles multi-turn chat conversations with Claude and MCP tools."""

    def __init__(
        self,
        api_key: str,
        model: str,
        mcp_manager: MCPManager,
    ):
        """
        Initialize chat analyzer.

        Args:
            api_key: Anthropic API key
            model: Claude model name
            mcp_manager: Initialized MCPManager with running servers
        """
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.mcp_manager = mcp_manager

    def send_message_sync(
        self,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        system_prompt: str,
        patient_context: str | None = None,
        max_tool_rounds: int = 10,
        on_tool_call: Callable[[str, dict], None] | None = None,
    ) -> dict[str, Any]:
        """
        Synchronous wrapper for send_message.

        Args:
            user_message: The user's new message
            conversation_history: Previous messages in Anthropic API format
            system_prompt: System prompt for Claude
            patient_context: Optional formatted patient data (added to first message only)
            max_tool_rounds: Maximum tool-use iterations per message
            on_tool_call: Callback when a tool is called (tool_name, args)

        Returns:
            {
                "response": str,  # Claude's text response
                "tool_calls": list[dict],  # Tool calls made {tool, args, result_preview}
                "updated_history": list[dict],  # Full conversation for next turn
            }
        """
        return asyncio.run(
            self._send_message(
                user_message,
                conversation_history,
                system_prompt,
                patient_context,
                max_tool_rounds,
                on_tool_call,
            )
        )

    async def _send_message(
        self,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        system_prompt: str,
        patient_context: str | None = None,
        max_tool_rounds: int = 10,
        on_tool_call: Callable[[str, dict], None] | None = None,
    ) -> dict[str, Any]:
        """
        Send a message and handle tool-use loop.

        Maintains conversation context and returns updated history for next turn.
        """
        # Get available tools
        tools = self.mcp_manager.get_all_tools()

        # Build the user message content
        if patient_context and not conversation_history:
            # First message: include patient context
            full_message = f"{patient_context}\n\n---\n\n**User:** {user_message}"
        else:
            full_message = user_message

        # Start with existing history
        messages = list(conversation_history)
        messages.append({"role": "user", "content": full_message})

        tool_log: list[dict[str, Any]] = []
        html_outputs: list[dict[str, Any]] = []  # Track HTML visualizations from tools

        # Tool-use loop
        for round_num in range(max_tool_rounds):
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system_prompt,
                tools=tools,
                messages=messages,
            )

            # Check if Claude is done
            if response.stop_reason == "end_turn":
                final_text = _extract_text(response)
                # Add assistant response to history
                messages.append({
                    "role": "assistant",
                    "content": _serialize_content(response.content),
                })
                return {
                    "response": final_text,
                    "tool_calls": tool_log,
                    "updated_history": messages,
                    "html_outputs": html_outputs,
                }

            # Process tool calls
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

            if not tool_use_blocks:
                # No tool calls — return what we have
                final_text = _extract_text(response)
                messages.append({
                    "role": "assistant",
                    "content": _serialize_content(response.content),
                })
                return {
                    "response": final_text,
                    "tool_calls": tool_log,
                    "updated_history": messages,
                    "html_outputs": html_outputs,
                }

            # Execute each tool call
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    # Notify callback
                    if on_tool_call:
                        on_tool_call(block.name, block.input)

                    # Execute tool
                    content_blocks = await self.mcp_manager.call_tool(block.name, block.input)

                    # Log the tool call and check for HTML visualizations
                    result_text = ""
                    for cb in content_blocks:
                        if isinstance(cb, dict) and cb.get("type") == "text":
                            text_content = cb.get("text", "")
                            result_text += text_content[:500]

                            # Check for HTML visualization output (e.g., from imgt__visualize_comparison)
                            try:
                                parsed = json.loads(text_content)
                                if isinstance(parsed, dict) and parsed.get("html"):
                                    html_outputs.append({
                                        "tool": block.name,
                                        "html": parsed["html"],
                                        "summary": parsed.get("summary"),
                                    })
                            except (json.JSONDecodeError, TypeError):
                                pass

                    tool_log.append({
                        "tool": block.name,
                        "args": block.input,
                        "result_preview": result_text[:300] + ("..." if len(result_text) > 300 else ""),
                    })

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content_blocks,
                    })

            # Append to conversation
            messages.append({
                "role": "assistant",
                "content": _serialize_content(response.content),
            })
            messages.append({
                "role": "user",
                "content": tool_results,
            })

        # Hit max rounds — request final summary
        messages.append({
            "role": "user",
            "content": "Please provide your response now based on everything gathered.",
        })

        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        )

        final_text = _extract_text(response)
        messages.append({
            "role": "assistant",
            "content": _serialize_content(response.content),
        })

        return {
            "response": final_text,
            "tool_calls": tool_log,
            "updated_history": messages,
            "html_outputs": html_outputs,
        }


def _extract_text(response) -> str:
    """Extract text content from a Claude API response."""
    parts = []
    for block in response.content:
        if hasattr(block, "text"):
            parts.append(block.text)
    return "\n".join(parts) if parts else "(No text response)"


def _serialize_content(content) -> list[dict[str, Any]]:
    """Serialize response content blocks for the messages list."""
    serialized = []
    for block in content:
        if block.type == "text":
            serialized.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            serialized.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })
    return serialized


def parse_tool_name(prefixed_name: str) -> tuple[str, str]:
    """
    Parse a prefixed tool name into (server, tool).

    Args:
        prefixed_name: e.g., "cedar__search_epitopes"

    Returns:
        Tuple of (server_name, tool_name), e.g., ("cedar", "search_epitopes")
    """
    if "__" in prefixed_name:
        parts = prefixed_name.split("__", 1)
        return parts[0], parts[1]
    return "unknown", prefixed_name

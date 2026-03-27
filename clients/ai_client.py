"""Claude AI analysis client — orchestrates Anthropic API with MCP tool use."""

import asyncio
import json
import logging
from typing import Any, Generator

import anthropic

from clients.mcp_manager import MCPManager

logger = logging.getLogger(__name__)


def _format_results_for_ai(results: dict[str, Any]) -> str:
    """Convert v1 analysis results into a concise text summary for Claude."""
    gene = results.get("gene", "unknown")
    mutation = results.get("mutation", "unknown")
    hla_alleles = results.get("hla_alleles", [])

    lines = [
        f"## Patient Query: {gene} {mutation}",
        f"**HLA alleles:** {', '.join(hla_alleles)}",
        "",
    ]

    # Epitope summary
    epitope_data = results.get("epitopes", {})
    epitopes = epitope_data.get("epitopes", [])
    lines.append(f"### Epitope Search Results ({epitope_data.get('total_count', 0)} found, "
                 f"{epitope_data.get('hla_matched_count', 0)} HLA-matched)")

    for i, ep in enumerate(epitopes[:5], 1):
        seq = ep.get("linear_sequence", "N/A")
        alleles = ", ".join(ep.get("mhc_alleles") or ["N/A"])
        matched = " [HLA MATCH]" if ep.get("hla_matched") else ""
        lines.append(
            f"{i}. `{seq}` — MHC: {alleles}{matched} | "
            f"T-cell assays: {ep.get('tcell_assay_count', 0)}, "
            f"TCRs: {ep.get('tcr_count', 0)}, "
            f"PDB: {len(ep.get('pdb_ids') or [])}"
        )

    if len(epitopes) > 5:
        lines.append(f"   ... and {len(epitopes) - 5} more epitopes")

    # Trials summary
    trials = results.get("trials", [])
    lines.append(f"\n### Clinical Trials ({len(trials)} found)")
    for t in trials[:3]:
        lines.append(f"- {t.get('nct_id', 'N/A')}: {t.get('title', 'N/A')} [{t.get('status', '')}]")

    # Publications summary
    pubs = results.get("publications", [])
    lines.append(f"\n### Publications ({len(pubs)} found)")
    for p in pubs[:3]:
        lines.append(f"- {p.get('title', 'N/A')} ({p.get('year', '')})")

    # HLA info
    hla_info = results.get("hla_info", [])
    if hla_info:
        lines.append(f"\n### HLA Allele Validation")
        for info in hla_info:
            name = info.get("name", info.get("allele", "?"))
            valid = "Validated" if info.get("valid") else "Not found"
            lines.append(f"- {name}: {valid}")

    return "\n".join(lines)


class AIAnalyzer:
    """Runs Claude AI analysis with MCP tools for deeper investigation."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250514"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def analyze_sync(
        self,
        results: dict[str, Any],
        mcp_manager: MCPManager,
        system_prompt: str,
        user_query: str | None = None,
        max_tool_rounds: int = 10,
        on_status: Any = None,
    ) -> dict[str, Any]:
        """Synchronous wrapper for the async analysis loop.

        Returns:
            {
                "response": str,  # Claude's final markdown text
                "tool_calls": list[dict],  # list of {tool, args, result_preview}
            }
        """
        return asyncio.run(
            self._analyze(results, mcp_manager, system_prompt, user_query, max_tool_rounds, on_status)
        )

    async def _analyze(
        self,
        results: dict[str, Any],
        mcp_manager: MCPManager,
        system_prompt: str,
        user_query: str | None = None,
        max_tool_rounds: int = 10,
        on_status: Any = None,
    ) -> dict[str, Any]:
        """Run the full analysis: send results to Claude, handle tool-use loop."""

        # Build tools list from MCP servers
        tools = mcp_manager.get_all_tools()

        if on_status:
            on_status(f"Loaded {len(tools)} MCP tools across servers")

        # Build user message
        results_text = _format_results_for_ai(results)
        if user_query:
            user_content = f"{results_text}\n\n---\n\n**User question:** {user_query}"
        else:
            user_content = (
                f"{results_text}\n\n---\n\n"
                "Please analyze these neoantigen results. Use the available MCP tools to "
                "investigate the most promising epitopes in greater depth. Provide a clinical "
                "interpretation with actionable insights."
            )

        messages: list[dict[str, Any]] = [
            {"role": "user", "content": user_content},
        ]

        tool_log: list[dict[str, Any]] = []

        for round_num in range(max_tool_rounds):
            if on_status:
                on_status(f"Sending request to Claude (round {round_num + 1})...")

            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system_prompt,
                tools=tools,
                messages=messages,
            )

            # Check if Claude is done (no more tool calls)
            if response.stop_reason == "end_turn":
                final_text = _extract_text(response)
                return {"response": final_text, "tool_calls": tool_log}

            # Process tool calls
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

            if not tool_use_blocks:
                # No tool calls and not end_turn — return what we have
                final_text = _extract_text(response)
                return {"response": final_text, "tool_calls": tool_log}

            # Execute each tool call
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    if on_status:
                        mapping = mcp_manager.get_server_for_tool(block.name)
                        server_label = mapping[0].upper() if mapping else "?"
                        tool_label = mapping[1] if mapping else block.name
                        on_status(f"Calling {server_label} → {tool_label}...")

                    content_blocks = await mcp_manager.call_tool(block.name, block.input)

                    # Log the tool call
                    result_text = ""
                    for cb in content_blocks:
                        if isinstance(cb, dict) and cb.get("type") == "text":
                            result_text += cb.get("text", "")[:500]
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

            # Append assistant message + tool results to conversation
            messages.append({"role": "assistant", "content": _serialize_content(response.content)})
            messages.append({"role": "user", "content": tool_results})

        # Hit max rounds
        if on_status:
            on_status("Reached maximum tool rounds, requesting final summary...")

        messages.append({
            "role": "user",
            "content": "Please provide your final analysis summary now based on everything gathered so far.",
        })
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        )
        final_text = _extract_text(response)
        return {"response": final_text, "tool_calls": tool_log}


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

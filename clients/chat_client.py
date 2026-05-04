"""Claude chat client for multi-turn conversations with MCP tool use.

Extends the single-shot analysis pattern to support persistent chat sessions
with conversation history and context awareness.
"""

import asyncio
import json
import logging
import re
from typing import Any, Callable

import anthropic

from clients.llm_provider import ChatResponse, LLMProvider, ToolCallRequest
from clients.anthropic_provider import AnthropicProvider
from clients.mcp_manager import MCPManager

logger = logging.getLogger(__name__)


# ============================================================
# Input Validation and Security
# ============================================================

# Patterns that indicate prompt injection attempts
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)",
    r"disregard\s+(all\s+)?(previous|prior|above)",
    r"forget\s+(all\s+)?(your|the)\s+(instructions?|rules?|guidelines?)",
    r"you\s+are\s+now\s+",
    r"act\s+as\s+(if\s+you\s+are\s+|a\s+)?",
    r"pretend\s+(to\s+be|you\s+are)",
    r"roleplay\s+as",
    r"new\s+(system\s+)?instructions?:",
    r"system\s*:\s*",
    r"\[system\]",
    r"<system>",
    r"override\s+(all\s+)?(security|safety|rules?)",
    r"bypass\s+(all\s+)?(restrictions?|filters?|rules?)",
    r"jailbreak",
    r"do\s+anything\s+now",
    r"dan\s+mode",
    r"developer\s+mode",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"show\s+(me\s+)?(your\s+)?(system\s+)?prompt",
    r"what\s+(are\s+)?(your\s+)?(system\s+)?instructions",
    r"print\s+(your\s+)?(system\s+)?prompt",
]

# Compile patterns for efficiency
INJECTION_REGEX = re.compile(
    "|".join(INJECTION_PATTERNS),
    re.IGNORECASE
)

# Keywords related to allowed topics (cancer immunotherapy)
ALLOWED_TOPIC_KEYWORDS = [
    # Mutations and genes
    "mutation", "kras", "braf", "tp53", "egfr", "pik3ca", "nras", "gene",
    "g12d", "g12v", "g12c", "v600e", "r175h", "l858r",
    # HLA
    "hla", "allele", "mhc", "major histocompatibility",
    # Immunology
    "epitope", "neoantigen", "antigen", "t-cell", "t cell", "tcr", "immunotherapy",
    "immunogenic", "peptide", "binding", "presentation",
    # Cancer
    "cancer", "tumor", "tumour", "oncology", "carcinoma", "melanoma", "lung",
    "pancreatic", "colorectal", "breast", "leukemia", "lymphoma",
    # Clinical
    "clinical trial", "nct", "vaccine", "treatment", "therapy", "patient",
    # Databases
    "cedar", "imgt", "pubmed", "clinicaltrials",
    # Analysis
    "compare", "analysis", "score", "assay", "sequence", "protein",
    # General research
    "research", "study", "publication", "literature",
]

# Off-topic indicators (things we should NOT help with)
OFFTOPIC_INDICATORS = [
    # Programming (except bioinformatics discussion)
    r"write\s+(me\s+)?(a\s+)?(python|javascript|code|script|program)",
    r"code\s+(for|to)\s+",
    r"create\s+(a\s+)?(website|app|application|game)",
    # Unrelated topics
    r"recipe\s+for",
    r"how\s+to\s+cook",
    r"write\s+(a\s+)?(poem|story|essay|song)",
    r"tell\s+me\s+a\s+joke",
    r"what\s+is\s+the\s+capital\s+of",
    r"translate\s+.+\s+to\s+",
    r"(crypto|bitcoin|stock|invest)",
    r"(dating|relationship)\s+advice",
]

OFFTOPIC_REGEX = re.compile(
    "|".join(OFFTOPIC_INDICATORS),
    re.IGNORECASE
)


class InputValidationError(Exception):
    """Raised when user input fails validation."""
    pass


def validate_user_input(message: str) -> tuple[bool, str | None]:
    """
    Validate user input for security and topic relevance.

    Returns:
        Tuple of (is_valid, error_message).
        If is_valid is True, error_message is None.
        If is_valid is False, error_message contains the reason.
    """
    # Check for empty or too long messages
    if not message or not message.strip():
        return False, "Please enter a message."

    if len(message) > 10000:
        return False, "Message is too long. Please keep messages under 10,000 characters."

    # Check for prompt injection attempts
    if INJECTION_REGEX.search(message):
        logger.warning(f"Potential prompt injection detected: {message[:100]}...")
        return False, None  # Return None to use the standard off-topic response

    # Check for clearly off-topic requests
    if OFFTOPIC_REGEX.search(message):
        # But allow if there are also on-topic keywords (might be legitimate context)
        message_lower = message.lower()
        has_topic_keyword = any(kw in message_lower for kw in ALLOWED_TOPIC_KEYWORDS)
        if not has_topic_keyword:
            return False, None  # Use standard off-topic response

    return True, None


def get_offtopic_response() -> str:
    """Return the standard response for off-topic or injection attempts."""
    return (
        "I'm specifically designed to assist with **neoantigen analysis and cancer immunotherapy research**. "
        "I can help you with:\n\n"
        "- **Epitope analysis** — T-cell assays, TCR sequences, MHC binding\n"
        "- **HLA allele information** — validation, comparison, sequences\n"
        "- **Cancer mutations** — KRAS, BRAF, TP53, EGFR, and others\n"
        "- **Clinical trials** — immunotherapy and neoantigen vaccine trials\n"
        "- **Literature search** — PubMed for relevant publications\n\n"
        "How can I assist you with your patient's case or research question?"
    )


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
        provider: LLMProvider,
        mcp_manager: MCPManager,
    ):
        """Initialize chat analyzer.

        Args:
            provider: An LLMProvider implementation (Anthropic, local, etc.)
            mcp_manager: Initialized MCPManager with running servers
        """
        self.provider = provider
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
        # Validate user input for security and topic relevance
        is_valid, error_msg = validate_user_input(user_message)
        if not is_valid:
            # Return an off-topic/security response without calling the LLM
            offtopic_response = error_msg if error_msg else get_offtopic_response()
            # Add to history so context is preserved
            updated_history = list(conversation_history)
            updated_history.append({"role": "user", "content": user_message})
            updated_history.append({"role": "assistant", "content": [{"type": "text", "text": offtopic_response}]})
            return {
                "response": offtopic_response,
                "tool_calls": [],
                "updated_history": updated_history,
                "html_outputs": [],
            }

        # Get the current event loop (or create one if needed)
        # This ensures we reuse the same loop that MCP servers are attached to
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        # Use the existing loop instead of asyncio.run() which creates a new loop
        # nest_asyncio allows running coroutines in an already-running loop
        return loop.run_until_complete(
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
            resp: ChatResponse = self.provider.chat(
                messages=messages,
                tools=tools,
                system=system_prompt,
                max_tokens=4096,
            )

            # Check if Claude is done
            if resp.stop_reason == "end_turn":
                final_text = resp.text
                # Add assistant response to history
                assistant_content = []
                if resp.text:
                    assistant_content.append({"type": "text", "text": resp.text})
                for tc in resp.tool_calls:
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    })
                messages.append({"role": "assistant", "content": assistant_content})
                return {
                    "response": final_text,
                    "tool_calls": tool_log,
                    "updated_history": messages,
                    "html_outputs": html_outputs,
                }

            # Process tool calls
            if not resp.tool_calls:
                # No tool calls — return what we have
                final_text = resp.text
                assistant_content = []
                if resp.text:
                    assistant_content.append({"type": "text", "text": resp.text})
                messages.append({"role": "assistant", "content": assistant_content})
                return {
                    "response": final_text,
                    "tool_calls": tool_log,
                    "updated_history": messages,
                    "html_outputs": html_outputs,
                }

            # Execute each tool call
            tool_results = []
            for tc in resp.tool_calls:
                # Notify callback
                if on_tool_call:
                    on_tool_call(tc.name, tc.arguments)

                # Execute tool
                content_blocks = await self.mcp_manager.call_tool(tc.name, tc.arguments)

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
                                    "tool": tc.name,
                                    "html": parsed["html"],
                                    "summary": parsed.get("summary"),
                                })
                        except (json.JSONDecodeError, TypeError):
                            pass

                tool_log.append({
                    "tool": tc.name,
                    "args": tc.arguments,
                    "result_preview": result_text[:300] + ("..." if len(result_text) > 300 else ""),
                })

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": content_blocks,
                })

            # Append to conversation
            assistant_content = []
            if resp.text:
                assistant_content.append({"type": "text", "text": resp.text})
            for tc in resp.tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.arguments,
                })
            messages.append({"role": "assistant", "content": assistant_content})
            messages.append({
                "role": "user",
                "content": tool_results,
            })

        # Hit max rounds — request final summary
        messages.append({
            "role": "user",
            "content": "Please provide your response now based on everything gathered.",
        })

        resp = self.provider.chat(
            messages=messages,
            system=system_prompt,
            max_tokens=4096,
        )

        final_text = resp.text
        assistant_content = []
        if resp.text:
            assistant_content.append({"type": "text", "text": resp.text})
        for tc in resp.tool_calls:
            assistant_content.append({
                "type": "tool_use",
                "id": tc.id,
                "name": tc.name,
                "input": tc.arguments,
            })
        messages.append({"role": "assistant", "content": assistant_content})

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


def make_anthropic_chat_analyzer(
    api_key: str,
    model: str,
    mcp_manager: MCPManager,
) -> "ChatAnalyzer":
    """Convenience factory mirroring the pre-refactor constructor."""
    provider = AnthropicProvider(api_key=api_key, model=model)
    return ChatAnalyzer(provider=provider, mcp_manager=mcp_manager)

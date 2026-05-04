"""Qwen3 chat-template helpers and tool-call parsing.

This module deliberately contains zero GPU/model code so it can be unit-tested
without loading transformers. The actual generation lives in local_provider.py.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from clients.llm_provider import ToolCallRequest

_TOOL_CALL_RE = re.compile(
    r"<tool_call>\s*(?P<body>.*?)\s*</tool_call>",
    re.DOTALL,
)


def anthropic_messages_to_qwen(
    messages: list[dict[str, Any]],
    system: str | None = None,
) -> list[dict[str, str]]:
    """Convert Anthropic-shaped messages to a flat Qwen chat-template list.

    Block-shaped content (text + tool_use + tool_result) is flattened to plain
    strings. Tool-result blocks are emitted as user messages prefixed with
    "[tool_result] ..." so Qwen sees the result inline.
    """
    out: list[dict[str, str]] = []
    if system:
        out.append({"role": "system", "content": system})

    for m in messages:
        content = m["content"]
        if isinstance(content, str):
            out.append({"role": m["role"], "content": content})
            continue

        # Block-shaped content: flatten in order
        parts: list[str] = []
        for block in content:
            btype = block.get("type")
            if btype == "text":
                parts.append(block["text"])
            elif btype == "tool_use":
                parts.append(
                    f"[tool_call] {block['name']}({json.dumps(block.get('input', {}))})"
                )
            elif btype == "tool_result":
                inner = block.get("content")
                inner_str = inner if isinstance(inner, str) else json.dumps(inner)
                parts.append(f"[tool_result {block.get('tool_use_id', '')}] {inner_str}")
        out.append({"role": m["role"], "content": "\n".join(parts)})

    return out


def anthropic_tools_to_qwen(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Anthropic tool schemas to Qwen/OpenAI function-calling schema."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object"}),
            },
        }
        for t in tools
    ]


def parse_qwen_tool_calls(raw: str) -> tuple[str, list[ToolCallRequest]]:
    """Extract <tool_call>...</tool_call> JSON blocks from a Qwen completion.

    Returns (text_without_calls, calls). Malformed JSON is silently ignored
    (the chunk is left in the text); we never raise from this helper.
    """
    calls: list[ToolCallRequest] = []
    pieces: list[str] = []
    last_end = 0

    for m in _TOOL_CALL_RE.finditer(raw):
        pieces.append(raw[last_end : m.start()])
        body = m.group("body")
        try:
            data = json.loads(body)
            if not isinstance(data, dict):
                raise TypeError("tool_call body is not a JSON object")
            args = data.get("arguments", {})
            # Qwen sometimes emits arguments as a JSON-encoded string
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            if not isinstance(args, dict):
                args = {}
            calls.append(
                ToolCallRequest(
                    id=f"qwen_{uuid.uuid4().hex[:8]}",
                    name=data["name"],
                    arguments=args,
                )
            )
        except (json.JSONDecodeError, KeyError, TypeError):
            pieces.append(m.group(0))
        last_end = m.end()

    pieces.append(raw[last_end:])
    text = "".join(pieces).strip()
    return text, calls

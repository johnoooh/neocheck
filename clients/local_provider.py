"""LLMProvider backed by a Qwen3 model running on ZeroGPU."""

from __future__ import annotations

from typing import Any

import spaces

from clients.llm_provider import ChatResponse
from clients.local_model import (
    anthropic_messages_to_qwen,
    anthropic_tools_to_qwen,
    generate_qwen,
    parse_qwen_tool_calls,
)


@spaces.GPU(duration=60)
def _generate_on_gpu(
    model_id: str,
    qwen_messages: list[dict[str, str]],
    qwen_tools: list[dict[str, Any]] | None,
    max_new_tokens: int,
) -> str:
    return generate_qwen(model_id, qwen_messages, qwen_tools, max_new_tokens)


class LocalProvider:
    """Qwen3 via transformers, executed inside an `@spaces.GPU` boundary."""

    supports_tools = True

    def __init__(self, model_id: str = "Qwen/Qwen3-14B-Instruct"):
        self.model_id = model_id
        self.name = f"local:{model_id}"

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        system: str | None = None,
        max_tokens: int = 768,  # cap to stay well inside ZeroGPU 60s window
    ) -> ChatResponse:
        qwen_messages = anthropic_messages_to_qwen(messages, system=system)
        qwen_tools = anthropic_tools_to_qwen(tools) if tools else None

        raw = _generate_on_gpu(self.model_id, qwen_messages, qwen_tools, max_tokens)
        text, calls = parse_qwen_tool_calls(raw)
        stop_reason = "tool_use" if calls else "end_turn"

        return ChatResponse(
            text=text,
            tool_calls=calls,
            stop_reason=stop_reason,
            raw=raw,
        )

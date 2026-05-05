"""Provider-agnostic interface for LLM chat with optional tool calls."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class ToolCallRequest:
    """A tool call requested by the model."""
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ChatResponse:
    """Normalized response shape across providers."""
    text: str
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    stop_reason: str = "end_turn"  # "end_turn" | "tool_use" | "max_tokens" | "error"
    raw: Any = None  # provider-native object for debugging


@runtime_checkable
class LLMProvider(Protocol):
    """Minimal interface every LLM backend must satisfy."""

    name: str
    supports_tools: bool

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> ChatResponse: ...


def build_provider(
    anthropic_key: str | None = None,
    use_fallback_local: bool = False,
) -> LLMProvider:
    """Construct an LLMProvider from explicit user choices.

    If `anthropic_key` is provided, returns AnthropicProvider; otherwise
    returns a LocalProvider using the default Qwen model (or the smaller
    fallback model when `use_fallback_local` is True).

    Imports of provider classes are deferred so that callers depending only
    on the LLMProvider protocol (e.g. tests) don't pay the import cost of
    transformers/torch.
    """
    if anthropic_key:
        from clients.anthropic_provider import AnthropicProvider
        from config import DEFAULT_ANTHROPIC_MODEL

        return AnthropicProvider(api_key=anthropic_key, model=DEFAULT_ANTHROPIC_MODEL)

    from clients.local_provider import LocalProvider
    from config import DEFAULT_LOCAL_MODEL_ID, FALLBACK_LOCAL_MODEL_ID

    model_id = FALLBACK_LOCAL_MODEL_ID if use_fallback_local else DEFAULT_LOCAL_MODEL_ID
    return LocalProvider(model_id=model_id)

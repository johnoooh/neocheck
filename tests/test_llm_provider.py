"""Tests for the LLMProvider Protocol and shared types."""

from clients.llm_provider import (
    ChatResponse,
    LLMProvider,
    ToolCallRequest,
)


class FakeProvider:
    """Minimal implementation to verify the Protocol shape."""

    name = "fake"
    supports_tools = True

    def chat(self, messages, tools=None, system=None, max_tokens=4096):
        return ChatResponse(
            text="hello",
            tool_calls=[ToolCallRequest(id="1", name="t", arguments={"x": 1})],
            stop_reason="end_turn",
            raw=None,
        )


def test_fake_provider_satisfies_protocol():
    p: LLMProvider = FakeProvider()
    assert p.name == "fake"
    assert p.supports_tools is True


def test_chat_response_returns_expected_shape():
    p = FakeProvider()
    resp = p.chat(messages=[{"role": "user", "content": "hi"}])
    assert resp.text == "hello"
    assert len(resp.tool_calls) == 1
    assert resp.tool_calls[0].name == "t"
    assert resp.tool_calls[0].arguments == {"x": 1}
    assert resp.stop_reason == "end_turn"

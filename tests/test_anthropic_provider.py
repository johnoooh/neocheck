"""Tests for AnthropicProvider — wraps the Anthropic SDK behind LLMProvider."""

from unittest.mock import MagicMock, patch

from clients.anthropic_provider import AnthropicProvider


@patch("clients.anthropic_provider.anthropic.Anthropic")
def test_anthropic_provider_returns_text(mock_client_cls):
    fake_block = MagicMock()
    fake_block.type = "text"
    fake_block.text = "Hello clinician"
    fake_resp = MagicMock()
    fake_resp.content = [fake_block]
    fake_resp.stop_reason = "end_turn"
    mock_client_cls.return_value.messages.create.return_value = fake_resp

    p = AnthropicProvider(api_key="sk-test", model="claude-haiku-4-5")
    out = p.chat(messages=[{"role": "user", "content": "hi"}], system="You are a bot")
    assert out.text == "Hello clinician"
    assert out.tool_calls == []
    assert out.stop_reason == "end_turn"


@patch("clients.anthropic_provider.anthropic.Anthropic")
def test_anthropic_provider_extracts_tool_calls(mock_client_cls):
    text_block = MagicMock(type="text", text="calling")
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.id = "toolu_1"
    tool_block.name = "search_pubmed"
    tool_block.input = {"query": "BRAF V600E"}
    fake_resp = MagicMock(
        content=[text_block, tool_block],
        stop_reason="tool_use",
    )
    mock_client_cls.return_value.messages.create.return_value = fake_resp

    p = AnthropicProvider(api_key="sk-test", model="claude-haiku-4-5")
    out = p.chat(
        messages=[{"role": "user", "content": "search"}],
        tools=[{"name": "search_pubmed", "input_schema": {}}],
    )
    assert out.text == "calling"
    assert len(out.tool_calls) == 1
    assert out.tool_calls[0].name == "search_pubmed"
    assert out.tool_calls[0].arguments == {"query": "BRAF V600E"}
    assert out.stop_reason == "tool_use"

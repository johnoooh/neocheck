"""Tests for Qwen3 prompt + tool-call helpers (no model load)."""

from clients.local_model import (
    anthropic_messages_to_qwen,
    anthropic_tools_to_qwen,
    parse_qwen_tool_calls,
)


def test_anthropic_messages_to_qwen_simple():
    msgs = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi"},
    ]
    out = anthropic_messages_to_qwen(msgs, system="You are helpful.")
    assert out[0] == {"role": "system", "content": "You are helpful."}
    assert out[1] == {"role": "user", "content": "Hello"}
    assert out[2] == {"role": "assistant", "content": "Hi"}


def test_anthropic_messages_to_qwen_flattens_blocks():
    msgs = [
        {"role": "user", "content": [
            {"type": "text", "text": "hello"},
            {"type": "tool_result", "tool_use_id": "x", "content": "got it"},
        ]},
    ]
    out = anthropic_messages_to_qwen(msgs)
    assert out[0]["role"] == "user"
    assert "hello" in out[0]["content"]
    assert "got it" in out[0]["content"]


def test_anthropic_tools_to_qwen():
    tools = [{
        "name": "search_pubmed",
        "description": "Search PubMed",
        "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}},
    }]
    out = anthropic_tools_to_qwen(tools)
    assert out[0]["type"] == "function"
    assert out[0]["function"]["name"] == "search_pubmed"
    assert out[0]["function"]["parameters"]["properties"]["q"]["type"] == "string"


def test_parse_qwen_tool_calls_single():
    raw = (
        'I will search.\n'
        '<tool_call>\n'
        '{"name": "search_pubmed", "arguments": {"q": "BRAF"}}\n'
        '</tool_call>'
    )
    text, calls = parse_qwen_tool_calls(raw)
    assert text.strip() == "I will search."
    assert len(calls) == 1
    assert calls[0].name == "search_pubmed"
    assert calls[0].arguments == {"q": "BRAF"}


def test_parse_qwen_tool_calls_no_calls():
    text, calls = parse_qwen_tool_calls("Just a plain answer.")
    assert text == "Just a plain answer."
    assert calls == []


def test_parse_qwen_tool_calls_malformed_json_falls_back_to_text():
    raw = '<tool_call>\nnot valid json\n</tool_call>'
    text, calls = parse_qwen_tool_calls(raw)
    # On malformed input, treat it as text rather than crashing
    assert calls == []
    assert "tool_call" in text or "not valid json" in text


def test_parse_qwen_tool_calls_json_array_body_falls_back_to_text():
    raw = '<tool_call>\n[1, 2, 3]\n</tool_call>'
    text, calls = parse_qwen_tool_calls(raw)
    assert calls == []
    assert "<tool_call>" in text


def test_parse_qwen_tool_calls_json_scalar_body_falls_back_to_text():
    raw = '<tool_call>\n42\n</tool_call>'
    text, calls = parse_qwen_tool_calls(raw)
    assert calls == []
    assert "<tool_call>" in text


def test_parse_qwen_tool_calls_string_encoded_arguments():
    raw = '<tool_call>\n{"name": "search", "arguments": "{\\"q\\": \\"BRAF\\"}"}\n</tool_call>'
    text, calls = parse_qwen_tool_calls(raw)
    assert len(calls) == 1
    assert calls[0].name == "search"
    assert calls[0].arguments == {"q": "BRAF"}


def test_local_model_imports_without_torch_or_transformers(monkeypatch):
    """The pure-helper module must be importable without ML deps loaded."""
    import importlib
    import sys
    monkeypatch.setitem(sys.modules, "torch", None)
    monkeypatch.setitem(sys.modules, "transformers", None)
    import clients.local_model  # noqa: F401
    importlib.reload(clients.local_model)
    # Just verify the public API still resolves
    from clients.local_model import (
        anthropic_messages_to_qwen,
        anthropic_tools_to_qwen,
        parse_qwen_tool_calls,
    )
    assert callable(anthropic_messages_to_qwen)
    assert callable(anthropic_tools_to_qwen)
    assert callable(parse_qwen_tool_calls)

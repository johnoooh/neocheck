# HF Spaces + ZeroGPU Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy NeoCheck publicly on Hugging Face Spaces with a free-by-default Qwen3-14B model running on ZeroGPU, BYO Anthropic key as alternate, and an inline feedback collection system, all without rewriting the Streamlit UI.

**Architecture:** Introduce a thin `LLMProvider` interface so `chat_client.py` can swap between local (Qwen3-14B via `@spaces.GPU`) and Anthropic providers without branching logic. Ship as a Docker Space (Streamlit + Node MCP servers in one image). Feedback persists to a private HF Dataset. All MCP plumbing, security, scoring, and tests stay intact.

**Tech Stack:** Python 3.11, Streamlit, Anthropic SDK, `transformers`, `accelerate`, `torch`, `huggingface_hub`, `datasets`, `spaces` (ZeroGPU decorator), Node 20, Docker.

**Spec:** [`../specs/2026-05-04-hfspaces-zerogpu-deployment-design.md`](../specs/2026-05-04-hfspaces-zerogpu-deployment-design.md)

**Repo paths in this plan are relative to** `/Users/orgeraj/hla/NeoCheck/neocheck/` (the inner git repo).

---

## File Structure

**New files:**
- `clients/llm_provider.py` — `LLMProvider` Protocol + shared dataclasses (`ChatResponse`, `ToolCallRequest`)
- `clients/anthropic_provider.py` — `AnthropicProvider` implementation
- `clients/local_model.py` — Qwen3 model loader, prompt formatting, tool-call parsing (pure-ish, GPU-free where possible)
- `clients/local_provider.py` — `LocalProvider` wraps `local_model` with `@spaces.GPU`
- `utils/feedback.py` — append-only HF Dataset writer
- `tests/test_llm_provider.py` — provider Protocol smoke tests with a fake provider
- `tests/test_anthropic_provider.py` — `AnthropicProvider` with mocked SDK
- `tests/test_local_model.py` — Qwen tool-call format conversion (pure functions, no model load)
- `tests/test_feedback.py` — feedback writer with mocked `huggingface_hub`
- `Dockerfile` (repo root)
- `.dockerignore` (repo root)

**Modified files:**
- `clients/chat_client.py` — accept `provider: LLMProvider` constructor arg; remove direct `anthropic.Anthropic` construction
- `app.py` — model selector sidebar, BYO key input, feedback expander, provider construction wiring
- `config.py` — add `DEFAULT_LOCAL_MODEL_ID = "Qwen/Qwen3-14B"`, remove hardcoded `claude-haiku-4-5` default
- `requirements.txt` — add `transformers`, `accelerate`, `torch`, `huggingface_hub`, `datasets`, `spaces`
- `README.md` — prepend HF Spaces YAML frontmatter

**Branch:** `hfspaces-deploy` off current `ai_analysis`.

---

## Task 1: Create deployment branch

**Files:**
- None (git only)

- [ ] **Step 1: Verify current branch and clean tree**

Run: `git status && git branch --show-current`
Expected: clean tree, branch `ai_analysis`.

- [ ] **Step 2: Create and switch to `hfspaces-deploy`**

Run: `git checkout -b hfspaces-deploy`
Expected: `Switched to a new branch 'hfspaces-deploy'`.

- [ ] **Step 3: Confirm test baseline still passes**

Run: `pytest tests/ -q`
Expected: 80 tests passing (per memory #547).

---

## Task 2: Define `LLMProvider` interface and shared types

**Files:**
- Create: `clients/llm_provider.py`
- Create: `tests/test_llm_provider.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_llm_provider.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_llm_provider.py -v`
Expected: ImportError / ModuleNotFoundError on `clients.llm_provider`.

- [ ] **Step 3: Implement the Protocol**

Create `clients/llm_provider.py`:
```python
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
```

`messages` follows the Anthropic shape (`{"role": "user"|"assistant", "content": str | list[block]}`) so existing `chat_client` history passes through unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_llm_provider.py -v`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clients/llm_provider.py tests/test_llm_provider.py
git commit -m "feat: add LLMProvider Protocol + ChatResponse types"
```

---

## Task 3: Implement `AnthropicProvider`

**Files:**
- Create: `clients/anthropic_provider.py`
- Create: `tests/test_anthropic_provider.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_anthropic_provider.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_anthropic_provider.py -v`
Expected: ImportError on `clients.anthropic_provider`.

- [ ] **Step 3: Implement `AnthropicProvider`**

Create `clients/anthropic_provider.py`:
```python
"""LLMProvider implementation backed by the Anthropic SDK."""

from __future__ import annotations

from typing import Any

import anthropic

from clients.llm_provider import ChatResponse, ToolCallRequest


class AnthropicProvider:
    """Wraps anthropic.Anthropic and normalizes responses to ChatResponse."""

    name = "anthropic"
    supports_tools = True

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self.client = anthropic.Anthropic(api_key=api_key)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> ChatResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        resp = self.client.messages.create(**kwargs)

        text_parts: list[str] = []
        tool_calls: list[ToolCallRequest] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCallRequest(
                        id=block.id,
                        name=block.name,
                        arguments=dict(block.input),
                    )
                )

        return ChatResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            stop_reason=resp.stop_reason,
            raw=resp,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_anthropic_provider.py -v`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clients/anthropic_provider.py tests/test_anthropic_provider.py
git commit -m "feat: AnthropicProvider implements LLMProvider"
```

---

## Task 4: Refactor `chat_client.py` to consume an `LLMProvider`

**Files:**
- Modify: `clients/chat_client.py`
- Modify: `tests/test_chat_client.py` (existing — add provider injection where helpful)

- [ ] **Step 1: Read the current ChatClient constructor**

Run: `sed -n '280,320p' clients/chat_client.py`
Note the line `self.client = anthropic.Anthropic(api_key=api_key)` (~line 289 per audit).

- [ ] **Step 2: Replace the constructor and call sites**

In `clients/chat_client.py`:

Add to imports:
```python
from clients.llm_provider import ChatResponse, LLMProvider, ToolCallRequest
from clients.anthropic_provider import AnthropicProvider
```

Replace the existing `__init__` for `ChatClient` so it takes a provider:
```python
def __init__(
    self,
    provider: LLMProvider,
    mcp_manager: MCPManager,
    system_prompt: str,
    max_iterations: int = 10,
):
    self.provider = provider
    self.mcp_manager = mcp_manager
    self.system_prompt = system_prompt
    self.max_iterations = max_iterations
```

Add a backwards-compat factory at module scope:
```python
def make_anthropic_chat_client(
    api_key: str,
    model: str,
    mcp_manager: MCPManager,
    system_prompt: str,
    max_iterations: int = 10,
) -> "ChatClient":
    """Convenience factory mirroring the pre-refactor constructor signature."""
    provider = AnthropicProvider(api_key=api_key, model=model)
    return ChatClient(
        provider=provider,
        mcp_manager=mcp_manager,
        system_prompt=system_prompt,
        max_iterations=max_iterations,
    )
```

Replace every `self.client.messages.create(...)` call with the equivalent through `self.provider.chat(...)`. Adapt the loop that reads `response.content` blocks: now iterate `resp.tool_calls` for tool-use and use `resp.text` for text. The shape mapping:
- `response.stop_reason == "tool_use"` → `resp.stop_reason == "tool_use"`
- text accumulation → `resp.text`
- tool blocks → `resp.tool_calls` (already parsed `ToolCallRequest` instances)

When constructing the next assistant message for the model, build the Anthropic-style content blocks from `resp.tool_calls`:
```python
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
```

- [ ] **Step 3: Run the existing chat_client tests**

Run: `pytest tests/test_chat_client.py -v`
Expected: tests pass; if any test instantiated `ChatClient(api_key=...)` directly, update those call sites to use `make_anthropic_chat_client(...)` or pass a fake provider.

- [ ] **Step 4: Run the full suite**

Run: `pytest tests/ -q`
Expected: 80 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add clients/chat_client.py tests/test_chat_client.py
git commit -m "refactor: chat_client consumes LLMProvider instead of Anthropic SDK"
```

---

## Task 5: Qwen3 prompt formatting + tool-call parsing (pure functions)

**Files:**
- Create: `clients/local_model.py` (initial pure-function portion only — model loading comes in Task 6)
- Create: `tests/test_local_model.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_local_model.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_local_model.py -v`
Expected: ImportError on `clients.local_model`.

- [ ] **Step 3: Implement the helpers**

Create `clients/local_model.py`:
```python
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
            calls.append(
                ToolCallRequest(
                    id=f"qwen_{uuid.uuid4().hex[:8]}",
                    name=data["name"],
                    arguments=data.get("arguments", {}),
                )
            )
        except (json.JSONDecodeError, KeyError):
            pieces.append(m.group(0))
        last_end = m.end()

    pieces.append(raw[last_end:])
    text = "".join(pieces).strip()
    return text, calls
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_local_model.py -v`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clients/local_model.py tests/test_local_model.py
git commit -m "feat: Qwen prompt + tool-call format helpers"
```

---

## Task 6: `LocalProvider` with ZeroGPU decorator

**Files:**
- Create: `clients/local_provider.py`
- Modify: `clients/local_model.py` (append generation function)
- Modify: `requirements.txt`

- [ ] **Step 1: Add Python deps**

Edit `requirements.txt` — append:
```
transformers>=4.46
accelerate>=1.0
torch>=2.4
huggingface_hub>=0.26
datasets>=3.0
spaces>=0.30
```

- [ ] **Step 2: Append generation function to `clients/local_model.py`**

Add at the bottom of `clients/local_model.py`:
```python
# ---------------------------------------------------------------------------
# Generation (depends on transformers; imported lazily to keep unit tests
# fast and to avoid loading the model when a different provider is in use).
# ---------------------------------------------------------------------------

_TOKENIZER = None
_MODEL = None


def _load(model_id: str) -> None:
    """Lazy-load tokenizer and model into module globals."""
    global _TOKENIZER, _MODEL
    if _MODEL is not None:
        return
    from transformers import AutoModelForCausalLM, AutoTokenizer  # noqa: WPS433

    _TOKENIZER = AutoTokenizer.from_pretrained(model_id)
    _MODEL = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype="auto",
        device_map="auto",
    )


def generate_qwen(
    model_id: str,
    messages: list[dict[str, str]],
    tools: list[dict[str, Any]] | None,
    max_new_tokens: int,
) -> str:
    """Run one generation and return the raw decoded string."""
    _load(model_id)
    template_kwargs: dict[str, Any] = {"add_generation_prompt": True, "tokenize": False}
    if tools:
        template_kwargs["tools"] = tools
    prompt = _TOKENIZER.apply_chat_template(messages, **template_kwargs)
    inputs = _TOKENIZER(prompt, return_tensors="pt").to(_MODEL.device)

    out = _MODEL.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        do_sample=False,
    )
    new_tokens = out[0][inputs["input_ids"].shape[1] :]
    return _TOKENIZER.decode(new_tokens, skip_special_tokens=True)
```

- [ ] **Step 3: Implement `LocalProvider`**

Create `clients/local_provider.py`:
```python
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

    def __init__(self, model_id: str = "Qwen/Qwen3-14B"):
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
```

- [ ] **Step 4: Smoke-import to catch obvious errors**

Run: `python -c "from clients.local_provider import LocalProvider; p = LocalProvider(); print(p.name, p.supports_tools)"`
Expected: prints `local:Qwen/Qwen3-14B True`. (Model is NOT loaded at construction — that happens on first `chat()` call inside the GPU boundary.)

If `spaces` isn't installed locally, the import will fail with a clear error. That's fine — we'll exercise the full path on the Space.

- [ ] **Step 5: Commit**

```bash
git add clients/local_provider.py clients/local_model.py requirements.txt
git commit -m "feat: LocalProvider with ZeroGPU + Qwen3 generation"
```

---

## Task 7: Wire model selection into the Streamlit UI

**Files:**
- Modify: `app.py`
- Modify: `config.py`

- [ ] **Step 1: Update `config.py`**

Add to `config.py`:
```python
# Default open-weight model used when no Anthropic key is provided.
DEFAULT_LOCAL_MODEL_ID = "Qwen/Qwen3-14B"

# Fallback when ZeroGPU quota is exhausted — smaller, less capable.
FALLBACK_LOCAL_MODEL_ID = "Qwen/Qwen3-4B"

# Default Anthropic model when user supplies their own key.
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"
```

Remove any other module-level `DEFAULT_MODEL = "claude-haiku-4-5"` if present.

- [ ] **Step 2: Add the model selector in `app.py` sidebar**

Locate the existing sidebar in `app.py`. Above the existing controls, add:

```python
import os
from clients.anthropic_provider import AnthropicProvider
from clients.local_provider import LocalProvider
from clients.llm_provider import LLMProvider
from config import (
    DEFAULT_ANTHROPIC_MODEL,
    DEFAULT_LOCAL_MODEL_ID,
    FALLBACK_LOCAL_MODEL_ID,
)

with st.sidebar:
    st.subheader("Model")
    model_choice = st.radio(
        "Which model should answer?",
        options=("Local: Qwen3-14B (free)", "Bring your own Anthropic key"),
        index=0,
        help=(
            "Local runs on free Hugging Face ZeroGPU. "
            "Bring-your-own gives Claude-quality answers but needs an API key."
        ),
    )
    if model_choice == "Bring your own Anthropic key":
        st.session_state["anthropic_key"] = st.text_input(
            "Anthropic API key",
            type="password",
            value=st.session_state.get("anthropic_key", ""),
            help="Stored only in this browser session. Never written to disk.",
        )
    else:
        st.session_state["anthropic_key"] = ""
    st.session_state["use_fallback_local"] = st.checkbox(
        "Use smaller fallback model (Qwen3-4B)",
        value=False,
        help="Enable if the default model is timing out or quota is exhausted.",
    )
```

- [ ] **Step 3: Add a helper to construct the provider on demand**

Add to `app.py`:
```python
def build_provider() -> LLMProvider:
    """Construct an LLMProvider from the current session state."""
    if st.session_state.get("anthropic_key"):
        return AnthropicProvider(
            api_key=st.session_state["anthropic_key"],
            model=DEFAULT_ANTHROPIC_MODEL,
        )
    model_id = (
        FALLBACK_LOCAL_MODEL_ID
        if st.session_state.get("use_fallback_local")
        else DEFAULT_LOCAL_MODEL_ID
    )
    return LocalProvider(model_id=model_id)
```

- [ ] **Step 4: Replace the existing ChatClient construction**

Find every place that builds a `ChatClient` (or imports `anthropic.Anthropic`) and replace with:
```python
provider = build_provider()
chat_client = ChatClient(
    provider=provider,
    mcp_manager=mcp_manager,
    system_prompt=CHAT_SYSTEM_PROMPT,
)
```

If any code path read `ANTHROPIC_API_KEY` from env to gate access, remove that gate — the local path doesn't need it.

- [ ] **Step 5: Manual smoke test (local Streamlit)**

Run: `streamlit run app.py`
Verify in the sidebar:
- "Local: Qwen3-14B (free)" is selected by default
- Switching to "Bring your own Anthropic key" reveals a password field
- Submitting a message with no key locally errors gracefully (model not on local CPU usually, but shouldn't crash the UI before reaching the provider call)

- [ ] **Step 6: Commit**

```bash
git add app.py config.py
git commit -m "feat: model selector UI, BYO Anthropic key path, default to local"
```

---

## Task 8: Feedback writer to private HF Dataset

**Files:**
- Create: `utils/feedback.py`
- Create: `tests/test_feedback.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_feedback.py`:
```python
"""Tests for the feedback writer (HF Dataset upload)."""

from unittest.mock import MagicMock, patch

from utils.feedback import FeedbackEntry, submit_feedback


def make_entry():
    return FeedbackEntry(
        rating="up",
        comment="great",
        email=None,
        model="local:Qwen/Qwen3-14B",
        mutation="BRAF V600E",
        hla=["HLA-A*02:01"],
        last_user_msg="explain this",
        last_assistant_msg="here you go",
    )


@patch("utils.feedback.HfApi")
def test_submit_feedback_uploads_jsonl(mock_api_cls):
    api = MagicMock()
    mock_api_cls.return_value = api

    submit_feedback(
        make_entry(),
        repo_id="someuser/feedback",
        token="hf_test",
    )

    assert api.upload_file.called
    kwargs = api.upload_file.call_args.kwargs
    assert kwargs["repo_id"] == "someuser/feedback"
    assert kwargs["repo_type"] == "dataset"
    assert kwargs["path_in_repo"].endswith(".jsonl")
    body = kwargs["path_or_fileobj"]
    if hasattr(body, "read"):
        body = body.read()
    body = body.decode() if isinstance(body, bytes) else body
    assert '"rating": "up"' in body
    assert '"mutation": "BRAF V600E"' in body


@patch("utils.feedback.HfApi")
def test_submit_feedback_truncates_long_text(mock_api_cls):
    api = MagicMock()
    mock_api_cls.return_value = api
    entry = make_entry()
    entry.last_user_msg = "x" * 5000

    submit_feedback(entry, repo_id="u/r", token="t")

    body = api.upload_file.call_args.kwargs["path_or_fileobj"]
    if hasattr(body, "read"):
        body = body.read()
    body = body.decode() if isinstance(body, bytes) else body
    # Truncated to 1000 chars
    assert "x" * 1001 not in body
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_feedback.py -v`
Expected: ImportError on `utils.feedback`.

- [ ] **Step 3: Implement `utils/feedback.py`**

Create `utils/feedback.py`:
```python
"""Append-only feedback writer that pushes JSONL rows to an HF Dataset."""

from __future__ import annotations

import io
import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from huggingface_hub import HfApi

_MAX_TEXT = 1000


@dataclass
class FeedbackEntry:
    rating: str  # "up" | "down"
    comment: str
    email: str | None
    model: str
    mutation: str | None
    hla: list[str] = field(default_factory=list)
    last_user_msg: str = ""
    last_assistant_msg: str = ""

    def to_row(self) -> dict:
        d = asdict(self)
        d["ts"] = datetime.now(timezone.utc).isoformat()
        d["last_user_msg"] = (d["last_user_msg"] or "")[:_MAX_TEXT]
        d["last_assistant_msg"] = (d["last_assistant_msg"] or "")[:_MAX_TEXT]
        d["comment"] = (d["comment"] or "")[:_MAX_TEXT]
        return d


def submit_feedback(
    entry: FeedbackEntry,
    repo_id: str,
    token: str,
) -> None:
    """Upload one JSONL line to repo_id as a new file (immutable, append-safe)."""
    row = entry.to_row()
    payload = (json.dumps(row) + "\n").encode()
    fname = f"feedback_{int(time.time())}_{uuid.uuid4().hex[:8]}.jsonl"

    api = HfApi(token=token)
    api.upload_file(
        path_or_fileobj=io.BytesIO(payload),
        path_in_repo=fname,
        repo_id=repo_id,
        repo_type="dataset",
    )
```

Each submission writes its own filename (avoids race conditions and avoids loading + rewriting an aggregated file).

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_feedback.py -v`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add utils/feedback.py tests/test_feedback.py
git commit -m "feat: feedback writer (append JSONL to private HF Dataset)"
```

---

## Task 9: Feedback expander UI

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add feedback UI under the AI Assistant section**

In `app.py`, locate the AI Assistant section (where the chat input and Download Chat Report button live). Below the chat output, add:

```python
import os
from utils.feedback import FeedbackEntry, submit_feedback

with st.expander("📣 Send feedback"):
    st.caption(
        "Help us improve NeoCheck. Do **not** paste patient identifiers. "
        "Submissions are stored privately and read by the maintainer."
    )
    fb_rating = st.radio(
        "Was this answer useful?",
        options=("👍 Yes", "👎 No"),
        horizontal=True,
        index=None,
    )
    fb_comment = st.text_area(
        "What worked or what didn't?",
        max_chars=1000,
        placeholder="Optional. Up to 1000 characters.",
    )
    fb_email = st.text_input(
        "Email (optional, for follow-up)",
        placeholder="leave blank to stay anonymous",
    )
    if st.button("Submit feedback", disabled=fb_rating is None):
        repo = os.environ.get("NEOCHECK_FEEDBACK_DATASET")
        token = os.environ.get("HF_TOKEN")
        if not repo or not token:
            st.error("Feedback storage isn't configured for this deployment.")
        else:
            last_user, last_asst = "", ""
            for msg in reversed(st.session_state.get("chat_messages", [])):
                if not last_asst and msg["role"] == "assistant":
                    last_asst = msg["content"]
                elif not last_user and msg["role"] == "user":
                    last_user = msg["content"]
                if last_user and last_asst:
                    break

            entry = FeedbackEntry(
                rating="up" if fb_rating.startswith("👍") else "down",
                comment=fb_comment,
                email=fb_email or None,
                model=st.session_state.get("active_model", "unknown"),
                mutation=st.session_state.get("mutation"),
                hla=st.session_state.get("hla_alleles", []),
                last_user_msg=last_user,
                last_assistant_msg=last_asst,
            )
            try:
                submit_feedback(entry, repo_id=repo, token=token)
                st.success("Thanks! Feedback submitted.")
            except Exception as exc:  # noqa: BLE001
                st.error(f"Could not submit feedback: {exc}")
```

In `build_provider()` (Task 7), set `st.session_state["active_model"] = provider.name` after construction so the feedback row records which model was used.

- [ ] **Step 2: Manual smoke test**

Run: `streamlit run app.py`
- Open the feedback expander; confirm Submit is disabled until a thumb is selected.
- With env vars unset, click Submit → expect the "isn't configured" error message.

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "feat: in-app thumbs+comment feedback collection"
```

---

## Task 10: Dockerfile and `.dockerignore` for the Space

**Files:**
- Create: `Dockerfile` (repo root: `/Users/orgeraj/hla/NeoCheck/neocheck/Dockerfile`)
- Create: `.dockerignore`

Note: the Docker build context is `neocheck/`. The MCP server subprojects live one directory up (`/Users/orgeraj/hla/NeoCheck/CEDARMCP` etc.). The Dockerfile must therefore be either built from the parent directory, or the MCP servers must be copied/symlinked into `neocheck/`. We choose the latter to keep the Space self-contained.

- [ ] **Step 1: Vendor the MCP servers under `neocheck/`**

For each MCP server, copy its source into `neocheck/mcp/` (idempotent — re-runnable):
```bash
rm -rf mcp
mkdir -p mcp
for d in CEDARMCP imgt-hla-mcp clinicaltrialsgov-mcp-server pubmedmcp; do
  if [ ! -d "../$d" ]; then
    echo "Missing ../$d — aborting"; exit 1
  fi
  cp -R "../$d" "mcp/$d"
  rm -rf "mcp/$d/node_modules" "mcp/$d/.git"
done
{
  echo ""
  echo "# Vendored MCP servers — exclude transient artifacts"
  echo "mcp/*/node_modules"
  echo "mcp/*/.git"
} >> .gitignore
```

Update `config.py` MCP server paths to point at `mcp/<name>/...` instead of the parent-relative paths.

- [ ] **Step 2: Create `.dockerignore`**

```
.git
__pycache__
.pytest_cache
.streamlit/secrets.toml
tests/
docs/
*.pyc
mcp/*/node_modules
mcp/*/.git
mcp/*/dist
.venv
venv
```

(`mcp/*/dist` is excluded so Docker rebuilds it fresh; if your tree commits `dist/`, drop that line.)

- [ ] **Step 3: Create `Dockerfile`**

```dockerfile
FROM python:3.11-slim

# Node.js 20 (for 3 of the 4 MCP servers)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first for cache
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App + MCP servers
COPY . /app

# Build Node MCP servers
RUN cd mcp/CEDARMCP && npm ci && npm run build \
    && cd /app/mcp/imgt-hla-mcp && npm ci && npm run build \
    && cd /app/mcp/clinicaltrialsgov-mcp-server && npm ci && npm run build

# Pre-warm HF model cache so first request is faster (optional; ~28 GB).
# Comment out if Space build time becomes a problem; ZeroGPU caches across runs.
# RUN python -c "from huggingface_hub import snapshot_download; \
#     snapshot_download('Qwen/Qwen3-14B')"

ENV PYTHONPATH=/app \
    STREAMLIT_SERVER_PORT=7860 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_SERVER_HEADLESS=true

EXPOSE 7860
CMD ["streamlit", "run", "app.py"]
```

- [ ] **Step 4: Local Docker smoke test**

Run: `docker build -t neocheck-space . && docker run --rm -p 7860:7860 neocheck-space`
Expected: container starts, Streamlit reachable at `http://localhost:7860`. (The local model won't run without a GPU; verify the UI loads and the MCP servers spawn.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore .gitignore mcp/ config.py
git commit -m "feat: Docker image bundles Streamlit + 4 MCP servers"
```

---

## Task 11: HF Spaces metadata in `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README to choose a non-destructive location**

Run: `head -5 README.md`

- [ ] **Step 2: Prepend YAML frontmatter**

Insert at the very top of `README.md`:
```yaml
---
title: NeoCheck
emoji: 🧬
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Cancer neoantigen and HLA analysis assistant
---
```

(Frontmatter must precede any other Markdown content.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "chore: add HF Spaces frontmatter"
```

---

## Task 12: Per-IP rate limiting wrapper

**Files:**
- Create: `utils/rate_limit.py`
- Create: `tests/test_rate_limit.py`
- Modify: `app.py` (call the limiter before invoking `chat_client`)

- [ ] **Step 1: Write failing tests**

Create `tests/test_rate_limit.py`:
```python
"""Tests for the in-process token bucket rate limiter."""

import time
from utils.rate_limit import RateLimiter


def test_under_limit_allows():
    rl = RateLimiter(per_hour=3, per_day=10)
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True


def test_over_hourly_limit_blocks():
    rl = RateLimiter(per_hour=2, per_day=10)
    assert rl.check("ip1") is True
    assert rl.check("ip1") is True
    assert rl.check("ip1") is False


def test_separate_ips_independent():
    rl = RateLimiter(per_hour=1, per_day=10)
    assert rl.check("a") is True
    assert rl.check("b") is True
    assert rl.check("a") is False
    assert rl.check("b") is False


def test_window_rolls_over(monkeypatch):
    rl = RateLimiter(per_hour=1, per_day=10)
    t = [1000.0]
    monkeypatch.setattr(time, "time", lambda: t[0])
    assert rl.check("ip") is True
    assert rl.check("ip") is False
    t[0] += 3601  # past hour
    assert rl.check("ip") is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_rate_limit.py -v`
Expected: ImportError on `utils.rate_limit`.

- [ ] **Step 3: Implement `RateLimiter`**

Create `utils/rate_limit.py`:
```python
"""Lightweight in-memory per-IP rate limiter.

Acceptable for single-process Streamlit deployments at small scale.
For multi-replica deployments, swap with Redis or similar.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, per_hour: int = 30, per_day: int = 200):
        self.per_hour = per_hour
        self.per_day = per_day
        self._lock = threading.Lock()
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, ip: str) -> bool:
        now = time.time()
        with self._lock:
            q = self._events[ip]
            cutoff_day = now - 86400
            while q and q[0] < cutoff_day:
                q.popleft()
            cutoff_hour = now - 3600
            hourly = sum(1 for t in q if t >= cutoff_hour)
            if len(q) >= self.per_day or hourly >= self.per_hour:
                return False
            q.append(now)
            return True
```

- [ ] **Step 4: Wire into `app.py`**

In `app.py`, before each `chat_client.send_message_sync(...)` call, gate on:
```python
from utils.rate_limit import RateLimiter
from streamlit.runtime.scriptrunner import get_script_run_ctx

if "rate_limiter" not in st.session_state:
    st.session_state["rate_limiter"] = RateLimiter()

ctx = get_script_run_ctx()
ip = (
    st.context.headers.get("x-forwarded-for", "anon").split(",")[0].strip()
    if hasattr(st, "context") else "anon"
)
if not st.session_state["rate_limiter"].check(ip):
    st.warning("Rate limit reached. Try again in an hour.")
    st.stop()
```

(`st.context.headers` is available in Streamlit ≥1.36; falls back to `"anon"` otherwise. On HF Spaces, X-Forwarded-For is populated by the proxy.)

- [ ] **Step 5: Run all tests**

Run: `pytest tests/ -q`
Expected: all tests pass (80 baseline + new ones from Tasks 2–12).

- [ ] **Step 6: Commit**

```bash
git add utils/rate_limit.py tests/test_rate_limit.py app.py
git commit -m "feat: per-IP token-bucket rate limiting"
```

---

## Task 13: Push to a private HF Space and smoke-test

**Files:**
- None (deployment only)

- [ ] **Step 1: Create the Space**

Via the HF web UI:
- Visit `https://huggingface.co/new-space`
- Name: `neocheck` (or similar)
- License: MIT
- SDK: **Docker**
- Visibility: **Private** for first launch

Or via CLI:
```bash
huggingface-cli login
huggingface-cli repo create neocheck --type space --space-sdk docker --private
```

- [ ] **Step 2: Add the Space remote and push**

```bash
git remote add hf https://huggingface.co/spaces/<your-username>/neocheck
git push hf hfspaces-deploy:main
```

- [ ] **Step 3: Configure secrets in Space settings**

In the Space's "Settings → Variables and secrets":
- Secret: `HF_TOKEN` → a write-scoped token
- Secret: `NEOCHECK_FEEDBACK_DATASET` → e.g. `<your-username>/neocheck-feedback`
- Enable "ZeroGPU" hardware

- [ ] **Step 4: Create the feedback dataset**

Via HF UI: create a private dataset named `<your-username>/neocheck-feedback` (empty is fine).

- [ ] **Step 5: First-load smoke test**

Wait for the build to finish in the Space logs. Open the Space URL.
Manually verify:
- UI loads
- Sidebar shows "Local: Qwen3-14B (free)" selected
- Submitting an analysis with `BRAF V600E` + `HLA-A*02:01` returns a result (first call: expect 30–60s as ZeroGPU spins up and weights download)
- A follow-up chat message returns text
- Feedback expander Submit succeeds and a JSONL file appears in the dataset
- A tool-using question (e.g. "search PubMed for V600E vaccine trials") triggers an MCP tool call and returns a synthesized answer

- [ ] **Step 6: If GPU OOM or timeouts: switch to fallback**

If Qwen3-14B times out at 60s for normal queries:
- Toggle "Use smaller fallback model (Qwen3-4B)" in the sidebar — verify it works
- Decide whether to flip the default in `config.py` (`DEFAULT_LOCAL_MODEL_ID = "Qwen/Qwen3-4B"`)

Document the decision in the Space's README.

---

## Task 14: Make Space public + merge

**Files:**
- None (admin only)

- [ ] **Step 1: Run all tests one more time**

Run: `pytest tests/ -q`
Expected: all green.

- [ ] **Step 2: Flip Space visibility to Public**

In Space Settings → Visibility → Public.

- [ ] **Step 3: Update project README with the live URL**

Edit `README.md` to add a "Live demo" section near the top with the Space URL.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: link to live HF Space"
git push hf hfspaces-deploy:main
```

- [ ] **Step 5: Merge to `ai_analysis` (or main, per repo convention)**

```bash
git checkout ai_analysis
git merge --no-ff hfspaces-deploy
git push origin ai_analysis
```

Defer this merge ~1 week so the Space gets real-world wear before anything lands on the main branch.

---

## Verification

End-to-end success criteria:

1. `pytest tests/ -q` passes locally on `hfspaces-deploy` branch (≥80 tests + the ~10 new ones).
2. `docker build .` succeeds locally.
3. The HF Space at `<your-username>/neocheck` builds without errors.
4. With sidebar default (Local), submitting `BRAF V600E` + `HLA-A*02:01` returns:
   - A scored epitope list
   - An AI Assistant chat that answers a follow-up question
   - At least one MCP tool execution surfaced in the chat trace
5. With BYO Anthropic key, the same flow returns higher-quality answers and works identically.
6. Feedback expander appends a JSONL file to the private dataset.
7. Rate limiting kicks in at the 31st message in an hour from the same IP.

## Risks (carried from spec)

- ZeroGPU 60s timeout on long answers → mitigated by `max_tokens=768` in `LocalProvider.chat`; if it still trips, the user sees a hard error and can re-submit.
- Docker build size with vendored MCP servers — should stay under 8 GB Space limit; if not, drop the `mcp/*/dist` exclusion and pre-build artifacts before `docker build`.
- Qwen3-14B tool calling may misformat occasionally → `parse_qwen_tool_calls` returns `[]` instead of crashing, so the chat loop simply gets a text-only turn back.

# NeoCheck Public Deployment via HF Spaces + ZeroGPU

**Date:** 2026-05-04
**Status:** Draft, pending implementation plan
**Branch:** `hfspaces-deploy` (to be created)

## Context

NeoCheck is a working Streamlit app for cancer neoantigen analysis. The current deployment story is "run it locally with an Anthropic API key." The goal is to make it publicly accessible to clinicians and researchers without requiring them to bring an API key, while keeping costs at $0/month given expected traffic of ~10 users/month.

We considered a full rewrite to Next.js + WebLLM (browser GPU) but ruled it out: the engineering cost (4–6 weeks) is not justified at this user volume, and the same goal — "free LLM, no API key required" — can be met by deploying the existing Streamlit app to Hugging Face Spaces and using ZeroGPU to run a server-side open-weight model on free A100 time.

## Goals

1. Public access at a stable URL, $0/month hosting.
2. No API key required for the default user path.
3. Higher answer quality than the current `claude-haiku-4-5` default by using a capable open-weight model (Qwen3-14B) on free GPU.
4. Preserve the existing security posture (input validation, prompt injection defense, XSS fix, MCP plumbing).
5. Add a lightweight feedback collection mechanism so the operator can learn from real usage.

## Non-goals

- Browser-side WebGPU inference (deferred; can be revisited if usage grows).
- Multi-tenant accounts, user logins, or persistent per-user state.
- Replacing Streamlit with a SPA.
- HIPAA / clinical-grade compliance. Banner remains "research use only."

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Hugging Face Space (Docker, Streamlit type)          │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Streamlit app (existing, lightly modified)     │  │
│  │  - app.py UI                                   │  │
│  │  - chat_client.py → uses LLMProvider iface     │  │
│  │  - epitope_analyzer.py, scoring, validators    │  │
│  │  - utils/formatters.py (HTML report)           │  │
│  └────────────────────────────────────────────────┘  │
│                       │                               │
│         ┌─────────────┴────────────┐                  │
│         ▼                          ▼                  │
│  ┌──────────────┐         ┌─────────────────┐        │
│  │ LocalProvider│         │ AnthropicProvider│       │
│  │ (ZeroGPU)    │         │ (BYO key)        │       │
│  │ Qwen3-14B    │         │ claude-haiku-4-5 │       │
│  └──────────────┘         └─────────────────┘        │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ MCP manager (existing Python plumbing)         │  │
│  │   ├─ CEDARMCP (Node)                           │  │
│  │   ├─ imgt-hla-mcp (Node)                       │  │
│  │   ├─ clinicaltrialsgov-mcp-server (Node)       │  │
│  │   └─ pubmedmcp (Python)                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Feedback writer → HF Dataset (private)         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

The Space ships as a single Docker container so MCP server subprocesses (Node + Python) all run in the same environment as the Streamlit process. ZeroGPU is invoked via `@spaces.GPU` decorators only on the inference function.

## Component changes

### 1. LLM provider abstraction (`neocheck/clients/llm_provider.py`, new)

Currently `chat_client.py` calls `anthropic.Anthropic` directly. Introduce a small interface so the chat loop is provider-agnostic:

```python
class LLMProvider(Protocol):
    name: str
    supports_tools: bool
    def chat(self, messages: list[dict], tools: list[dict] | None = None,
             system: str | None = None, max_tokens: int = 4096) -> ChatResponse: ...
```

Two concrete implementations:

- `AnthropicProvider` — wraps existing Anthropic SDK call, used when user supplies a key.
- `LocalProvider` — loads Qwen3-14B-Instruct via `transformers`, exposed through a `@spaces.GPU(duration=60)` function. Uses Qwen's native tool-call format and translates to Anthropic's tool schema for the chat loop. (vLLM is not used: ZeroGPU's ephemeral GPU attachment model conflicts with vLLM's persistent server requirement.)

`chat_client.py` is updated to take a `provider: LLMProvider` argument instead of constructing an Anthropic client itself. The agentic loop (current tool-call orchestration) stays put; only the call site changes.

### 2. ZeroGPU integration (`neocheck/clients/local_model.py`, new)

```python
import spaces
from transformers import AutoModelForCausalLM, AutoTokenizer

_MODEL_ID = "Qwen/Qwen3-14B-Instruct"
_tokenizer = None
_model = None

def _load():
    global _tokenizer, _model
    if _model is None:
        _tokenizer = AutoTokenizer.from_pretrained(_MODEL_ID)
        _model = AutoModelForCausalLM.from_pretrained(
            _MODEL_ID, torch_dtype="auto", device_map="auto"
        )

@spaces.GPU(duration=60)
def generate(messages, tools=None, max_tokens=4096):
    _load()
    # apply chat template, tokenize, generate, decode
    # parse Qwen tool-call markup back into structured calls
    ...
```

Lazy-loading inside the GPU-decorated function is important: ZeroGPU only attaches a GPU during the call, so model loading must happen there. We rely on `transformers`' module-level cache so subsequent calls are fast.

### 3. Model selector UI (in `neocheck/app.py`)

Add a sidebar section "Model" with:
- Radio: "Local: Qwen3-14B (free)" / "Bring your own Anthropic key"
- If BYO key chosen: text input for key (password-masked, stored in `st.session_state` only — never written to disk)
- Optional advanced toggle for `Qwen3-4B` (fallback when ZeroGPU quota is exhausted)

Default = Local. The current "claude-haiku-4-5" default is removed.

### 4. Feedback system (new)

A "Send feedback" expander at the bottom of the AI Assistant section:
- Thumbs up / thumbs down (binary; simpler to implement and analyze than a 5-star scale)
- Free-text "What worked / what didn't?" field
- Optional contact email
- Implicit context capture: current mutation/HLA inputs, last user message, last assistant response, model used (no full chat history to keep payloads small and reduce PII risk)

Submission writes a row to a **private** HF Dataset whose repo ID is read from env var `NEOCHECK_FEEDBACK_DATASET` (e.g. `johnoooh/neocheck-feedback`). Implementation uses `datasets.Dataset.push_to_hub` for append semantics, or batched JSONL uploads via `huggingface_hub.HfApi.upload_file` if push_to_hub turns out too slow per-call. The Space gets a write-scoped HF token via the Space's "Secrets" settings (`HF_TOKEN`).

Schema (one Parquet/JSONL row per submission):
```
{ "ts": iso8601,
  "model": "qwen3-14b" | "claude-haiku-4-5" | ...,
  "rating": 1-5 or "up"/"down",
  "comment": str,
  "email": str | null,
  "mutation": str | null,
  "hla": list[str],
  "last_user_msg": str (truncated to 1000 chars),
  "last_assistant_msg": str (truncated to 1000 chars) }
```

Anonymous by default — email field is optional and clearly labeled.

### 5. Docker image for the Space (`Dockerfile`, new at repo root)

The Space type will be **Docker**, not the default Streamlit Space, because we need both Node.js (for 3 of the 4 MCP servers) and Python in the same image.

```dockerfile
FROM python:3.11-slim

# Node.js for MCP servers
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs git build-essential

WORKDIR /app
COPY . /app

# Build MCP servers
RUN cd CEDARMCP && npm ci && npm run build \
    && cd ../imgt-hla-mcp && npm ci && npm run build \
    && cd ../clinicaltrialsgov-mcp-server && npm ci && npm run build

# Python deps including spaces, transformers, accelerate
RUN pip install --no-cache-dir -r neocheck/requirements.txt \
    && pip install --no-cache-dir spaces transformers accelerate huggingface_hub

EXPOSE 7860
CMD ["streamlit", "run", "neocheck/app.py", \
     "--server.port=7860", "--server.address=0.0.0.0", \
     "--server.headless=true"]
```

`requirements.txt` updated to add `spaces`, `transformers`, `accelerate`, `torch` (CUDA build picked up by ZeroGPU runtime), `huggingface_hub`, `datasets`.

### 6. Space configuration (`README.md` frontmatter at repo root)

HF Spaces reads YAML frontmatter from `README.md`:

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
hf_oauth: false
---
```

### 7. Secrets

Set in Space settings (never committed):
- `HF_TOKEN` — write-scoped, for appending feedback rows to the private dataset
- `NEOCHECK_FEEDBACK_DATASET` — repo ID of the feedback dataset (e.g. `johnoooh/neocheck-feedback`)
- `ANTHROPIC_API_KEY` — **not set as Space secret**; users supply their own through the UI when they choose BYO

### 8. Rate limiting / abuse protection

At ~10 users/month this is overkill, but cheap to add:
- Simple per-IP token bucket (`slowapi` middleware behind Streamlit's session — actually Streamlit doesn't expose middleware directly, so do it via a wrapper around `chat_client.send_message_sync`)
- Cap: 30 messages / hour / IP, 200 / day / IP
- ZeroGPU's per-Space quota is its own ceiling

### 9. Files removed / unchanged

**Removed:**
- Hardcoded `claude-haiku-4-5` default in `neocheck/app.py`

**Unchanged (verified to keep working):**
- `analyzers/epitope_analyzer.py`
- `utils/formatters.py` (already XSS-fixed)
- `utils/validators.py`
- `clients/mcp_manager.py`, `clients/mcp_session.py` (event-loop and buffer fixes preserved)
- `tests/` (all 80 tests should continue to pass; new tests added for `LLMProvider` abstraction)
- The 4 MCP server subprojects under top-level repo

## Migration plan

The Space starts on a new branch `hfspaces-deploy` so `main` keeps working as the local-dev path with Anthropic.

1. Create branch `hfspaces-deploy`.
2. Add `LLMProvider` interface + `AnthropicProvider` (refactor only, behavior unchanged).
3. Wire `chat_client.py` to use the provider; verify all 80 tests still pass.
4. Add `LocalProvider` with a stub that runs `Qwen3-1.7B` locally (CPU) for dev iteration.
5. Add `Dockerfile`, Space `README.md` frontmatter, and the `@spaces.GPU` wrapper.
6. Add the model selector UI and the feedback expander.
7. Push branch to a private fork on Hugging Face, smoke-test the Space.
8. Promote model to Qwen3-14B, verify ZeroGPU works, measure latency.
9. Make the Space public.
10. Merge back to `main` only after the Space has been stable for ~1 week.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Qwen3-14B exceeds ZeroGPU 60s timeout for long answers | Cap `max_new_tokens` at 768; stream tokens; add a hard "thinking too long, try again" path |
| Tool-call format translation between Qwen and Anthropic shapes is buggy | Implement and unit-test the converter; fall back to "no tools" mode if conversion fails |
| MCP Node servers fail to build inside the Space's Docker context | Pre-build during Docker build step; if size becomes an issue, vendor build artifacts |
| ZeroGPU daily quota exhausted by a few enthusiastic users | Surface a clear "GPU quota for today exhausted, switch to BYO key or try later" message; consider HF Pro ($9/mo) if it actually happens |
| Feedback dataset accidentally captures PHI users paste in | Truncate captured text; add a clear "do not paste patient identifiers" notice near input box; honor the existing PHI prohibition in CLAUDE.md |
| Model weights ~28 GB pulled on every cold start | HF Spaces caches model weights in a persistent layer; verify by inspecting cold-start time on first deploy |

## Out of scope (can be follow-ups)

- Browser-side WebLLM / WebGPU implementation (revisit if usage grows past Spaces quota)
- Per-user accounts and saved analysis history
- A SPA frontend
- Multi-region deployment
- Hosted Anthropic key with rate-limited free tier
- Telemetry beyond the explicit feedback form

---
title: NeoCheck
emoji: 🧬
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: "6.14.0"
app_file: gradio_app.py
python_version: "3.12"
hardware: zero-a10g
pinned: false
license: mit
short_description: Cancer neoantigen and HLA analysis assistant
---

# 🧬 NeoCheck

**Neoantigen × HLA compatibility checker for cancer immunotherapy research.**

Given a cancer mutation and a patient's HLA typing, NeoCheck pulls together
epitope evidence, T-cell assays, TCR sequences, clinical trials, and recent
publications from four public databases — and lets you have a follow-up
conversation with an LLM that can dig deeper using the same data sources.

## What it does

- **Searches CEDAR / IEDB** for known epitopes carrying your mutation, with
  HLA-restriction filtering and an immunogenicity composite score.
- **Validates the patient's HLA alleles** against IMGT/HLA, including
  expression status and citations.
- **Pulls relevant clinical trials** from ClinicalTrials.gov.
- **Surfaces recent literature** from PubMed.
- **Hands the results to an LLM** that can call the same MCP tools to answer
  follow-up questions, compare alleles, or pull deeper structural data.

No API keys are required for the analysis. The chat assistant runs on either
a free local model (Qwen3-14B / 4B on Hugging Face ZeroGPU) or your own
Anthropic API key — your choice in the sidebar.

## Try it

Hosted Gradio Space (ZeroGPU): https://huggingface.co/spaces/Johnoooh/neocheck-gradio

## Data sources

| Source | What it provides | Access |
|---|---|---|
| **CEDAR (IEDB)** | Epitope structures, T-cell assays, TCR sequences, MHC ligand assays, PDB structures | Public REST + MCP server |
| **IMGT/HLA (EBI)** | HLA allele validation, accession, metadata, citations, sequence comparisons | Public REST + MCP server |
| **ClinicalTrials.gov** | Trial registry — recruiting immunotherapy and neoantigen-vaccine trials | API v2 + MCP server |
| **PubMed** | Recent literature on the gene, mutation, and immunotherapy context | E-utilities + MCP server |

## Architecture

```
                 ┌────────────────────────┐
                 │   Gradio UI (gr.Blocks)│
                 │   gradio_app.py        │
                 └──────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────────┐
        │                   │                       │
        ▼                   ▼                       ▼
 analyzers/         clients/chat_client.py     clients/llm_provider.py
 (epitope, hla,     ├ async send_message       ├ AnthropicProvider
  trial, pubs)      ├ tool-use loop            └ LocalProvider (@spaces.GPU
                    └ html_outputs                  → Qwen3-14B / 4B)
                            │
                            ▼
                  clients/mcp_session.py
                  clients/mcp_manager.py
                            │
        ┌───────────┬───────┴───────┬───────────────┐
        ▼           ▼               ▼               ▼
   CEDAR MCP   IMGT/HLA MCP   ClinicalTrials MCP  PubMed MCP
   (Node.js)   (Node.js)      (Node.js / Bun)     (Python)
```

The four MCP servers ship vendored under `mcp/` with their `dist/`
directories committed so the Gradio Space (which has no Dockerfile)
can launch them directly. `python -m pubmedmcp` runs from
`mcp/pubmedmcp/src/`; the Node servers run via `node dist/index.js`.

## Quick start (local)

```bash
# Python 3.12 venv; works with uv, pip, or conda
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# Make sure node 18+ is on PATH (for the JS-based MCP servers)
node --version

# Run the Gradio UI on http://localhost:7860
.venv/bin/python gradio_app.py
```

The Streamlit version is still in the repo as `app.py` (`streamlit run app.py`)
and has feature parity with the Gradio app for the analysis flow. The Gradio
app is the supported entry point.

## Configuration

| Env var | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | If you want to use the Anthropic chat path from the CLI / tests. The UI accepts a key directly via the sidebar. | No |
| `HF_TOKEN` | Lets the chat-feedback button write to a Hugging Face dataset. Configure as a Space secret. | Optional |
| `NEOCHECK_FEEDBACK_DATASET` | The dataset repo (e.g. `your-username/neocheck-feedback`) that feedback is appended to. | Optional |
| `GRADIO_SSR_MODE` | Set to `False` if you ever see the Node sidecar getting killed; `gradio_app.py` already does this. | No |

## Tech stack

- **UI:** Gradio 6.14 (`gradio_app.py`) — `gr.Blocks` with custom HTML cards,
  chat panel, and sandboxed `<iframe srcdoc>` for IMGT visualizations.
  Streamlit (`app.py`) kept as a working fallback.
- **LLM providers:**
  - **Local:** Qwen3-14B (Qwen3-4B fallback toggle) via `transformers`,
    wrapped in `@spaces.GPU(duration=180)` for ZeroGPU.
  - **API:** Anthropic Claude via the `anthropic` SDK; bring-your-own-key
    selectable in the sidebar.
- **MCP:** Custom `MCPManager` / `MCPSession` over stdio. Per-session lazy
  initialization so each ZeroGPU worker starts its own server pool on the
  first chat message.
- **Score:** 0–100 composite — T-cell assays (25), positive-response ratio
  (20), TCR sequences (20), MHC ligand assays (15), PDB structure (10), HLA
  match bonus (+10). See the **Scoring** tab in the app for the full
  breakdown.

## Repository layout

```
gradio_app.py            # Gradio entry point (HF Spaces app_file)
app.py                   # Streamlit version (kept as fallback)
config.py                # System prompts, MCP server registry, model IDs
requirements.txt         # Python deps
packages.txt             # apt deps for HF Spaces (just nodejs)

analyzers/               # Pure-Python analysis: epitope, HLA, trials, pubs
clients/                 # LLM providers + MCP client glue
  ├ anthropic_provider.py
  ├ local_provider.py    # @spaces.GPU-decorated Qwen entry
  ├ local_model.py
  ├ chat_client.py       # async + sync send_message; tool-use loop
  ├ llm_provider.py      # Protocol + build_provider() factory
  ├ mcp_manager.py       # stdio subprocess pool
  └ mcp_session.py       # lifecycle wrapper
utils/                   # Validators, formatters, scoring, rate-limit, feedback
mcp/                     # Vendored MCP servers (with prebuilt dist/ committed)
  ├ CEDARMCP/            # Node.js
  ├ imgt-hla-mcp/        # Node.js
  ├ clinicaltrialsgov-mcp-server/  # Bun-built JS
  └ pubmedmcp/           # Python
tests/                   # pytest suite (101 tests)
```

## Disclaimer

NeoCheck is a research tool. Results should not drive clinical
decision-making without independent professional review. The composite
score is a heuristic over public evidence; it does not predict patient
response to any specific therapy.

## License

MIT.

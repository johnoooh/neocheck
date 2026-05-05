"""NeoCheck: Gradio frontend (Phase 2 — non-chat parity).

Run locally:
    python gradio_app.py

This module mirrors the non-chat surface of `app.py` (input form,
analysis pipeline, results tabs, downloads) using Gradio. Chat is
deferred to Phase 4. Streamlit `app.py` stays untouched and continues
to work; both apps share `analyzers/`, `utils/`, `clients/`, and
`config.py`.
"""

from __future__ import annotations

import functools
import json
import os
import sys
import tempfile
import time
from datetime import datetime
from typing import Any

# HF Spaces calls demo.launch() itself, so we can't pass ssr_mode=False there.
# Disable Gradio 6's experimental SSR mode (Node.js sidecar) before importing
# gradio — the sidecar gets killed in the HF Spaces container, crashing the
# app right after it boots.
os.environ.setdefault("GRADIO_SSR_MODE", "False")

import gradio as gr
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from clients.llm_provider import build_provider as _build_provider  # noqa: E402
# Eagerly import local_provider so ZeroGPU sees the @spaces.GPU decorator
# during startup. ZeroGPU rejects Spaces with no decorated GPU function
# at import time. The actual model weights still load lazily inside chat().
import clients.local_provider  # noqa: E402,F401
from config import CANCER_TYPES, CHAT_SYSTEM_PROMPT, EXAMPLES, GENE_MUTATIONS, MCP_SERVERS_CONFIG  # noqa: E402
from utils.feedback import FeedbackEntry, submit_feedback  # noqa: E402
from utils.formatters import (  # noqa: E402
    generate_chat_report,
    generate_html_report,
    results_to_csv,
    results_to_json,
)
from utils.rate_limit import RateLimiter  # noqa: E402
from utils.scoring import summarize_epitope  # noqa: E402
from utils.validators import (  # noqa: E402
    normalize_hla_allele,
    normalize_hla_allele_full,
    validate_hla_allele,
    validate_mutation,
)


# Process-wide rate limiter (matches app.py)
_RATE_LIMITER = RateLimiter()


# ---------------------------------------------------------------------------
# Tiny TTL cache (replacement for @st.cache_data; no Streamlit dep)
# ---------------------------------------------------------------------------

def _ttl_cache(ttl_seconds: int):
    def decorator(fn):
        store: dict[Any, tuple[float, Any]] = {}

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time.time()
            hit = store.get(key)
            if hit is not None and now - hit[0] < ttl_seconds:
                return hit[1]
            value = fn(*args, **kwargs)
            store[key] = (now, value)
            return value

        return wrapper
    return decorator


@_ttl_cache(86400)
def cached_search_epitopes(mutation: str, hla_alleles_tuple: tuple, neoantigen_only: bool, limit: int):
    from analyzers.epitope_analyzer import search_epitopes_for_mutation
    return search_epitopes_for_mutation(
        mutation=mutation,
        hla_alleles=list(hla_alleles_tuple),
        neoantigen_only=neoantigen_only,
        limit=limit,
    )


@_ttl_cache(86400)
def cached_get_epitope_details(structure_id: int, mutation: str | None = None):
    from analyzers.epitope_analyzer import get_epitope_details
    return get_epitope_details(structure_id, mutation=mutation)


@_ttl_cache(604800)
def cached_fetch_hla_info(allele_names_tuple: tuple):
    from analyzers.hla_analyzer import fetch_all_hla_info
    return fetch_all_hla_info(list(allele_names_tuple))


@_ttl_cache(3600)
def cached_search_trials(gene: str, mutation: str, cancer_type: str, max_results: int):
    from analyzers.trial_analyzer import search_relevant_trials
    ct = cancer_type if cancer_type != "Any" else None
    return search_relevant_trials(gene, mutation, cancer_type=ct, max_results=max_results)


@_ttl_cache(86400)
def cached_search_publications(gene: str, mutation: str, max_results: int):
    from analyzers.publication_analyzer import search_publications
    return search_publications(gene, mutation, max_results=max_results)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    return (text or "").replace("*", "\\*")


def _validate(gene, mutation, hla_a1, hla_a2, hla_b1, hla_b2, hla_c1, hla_c2):
    errors: list[str] = []
    gene = (gene or "").strip().upper()
    mutation = (mutation or "").strip().upper()

    if not gene:
        errors.append("Gene name is required.")

    mut_valid, mut_msg = validate_mutation(mutation)
    if not mut_valid:
        errors.append(mut_msg)

    hla_alleles: list[str] = []
    for label, val in [
        ("HLA-A1", hla_a1), ("HLA-A2", hla_a2),
        ("HLA-B1", hla_b1), ("HLA-B2", hla_b2),
        ("HLA-C1", hla_c1), ("HLA-C2", hla_c2),
    ]:
        if val and val.strip():
            ok, msg = validate_hla_allele(val)
            if not ok:
                errors.append(f"{label}: {msg}")
            else:
                normalized = normalize_hla_allele(val)
                if normalized:
                    hla_alleles.append(normalized)

    if not hla_alleles:
        errors.append("At least one HLA allele is required.")

    if errors:
        return None, "\n".join(errors)
    return {"gene": gene, "mutation": mutation, "hla_alleles": hla_alleles}, ""


# ---------------------------------------------------------------------------
# Run analysis
# ---------------------------------------------------------------------------

def run_analysis(
    gene, mutation,
    hla_a1, hla_a2, hla_b1, hla_b2, hla_c1, hla_c2,
    cancer_type, neoantigen_only, max_epitopes, max_trials, max_pubs,
    progress=gr.Progress(),
):
    cleaned, err = _validate(gene, mutation, hla_a1, hla_a2, hla_b1, hla_b2, hla_c1, hla_c2)
    if err:
        raise gr.Error(err)

    inputs = {
        **cleaned,
        "cancer_type": cancer_type,
        "neoantigen_only": bool(neoantigen_only),
        "max_epitopes": int(max_epitopes),
        "max_trials": int(max_trials),
        "max_pubs": int(max_pubs),
    }

    results: dict[str, Any] = {
        "gene": inputs["gene"],
        "mutation": inputs["mutation"],
        "hla_alleles": inputs["hla_alleles"],
    }

    progress(0.10, desc="Searching CEDAR for epitopes...")
    try:
        results["epitopes"] = cached_search_epitopes(
            mutation=inputs["mutation"],
            hla_alleles_tuple=tuple(inputs["hla_alleles"]),
            neoantigen_only=inputs["neoantigen_only"],
            limit=inputs["max_epitopes"],
        )
    except Exception as e:
        gr.Warning(f"CEDAR epitope search failed: {e}")
        results["epitopes"] = {"epitopes": [], "total_count": 0, "hla_matched_count": 0}

    progress(0.30, desc="Validating HLA alleles with IMGT...")
    try:
        full_alleles = []
        for a in inputs["hla_alleles"]:
            full = normalize_hla_allele_full(a)
            full_alleles.append(full or a.replace("HLA-", ""))
        results["hla_info"] = cached_fetch_hla_info(tuple(full_alleles))
    except Exception as e:
        gr.Warning(f"IMGT HLA lookup: {e}")
        results["hla_info"] = []

    progress(0.50, desc="Searching ClinicalTrials.gov...")
    try:
        results["trials"] = cached_search_trials(
            inputs["gene"], inputs["mutation"], inputs["cancer_type"], inputs["max_trials"],
        )
    except Exception as e:
        gr.Warning(f"Clinical trials search: {e}")
        results["trials"] = []

    progress(0.70, desc="Searching PubMed...")
    try:
        results["publications"] = cached_search_publications(
            inputs["gene"], inputs["mutation"], inputs["max_pubs"],
        )
    except Exception as e:
        gr.Warning(f"PubMed search: {e}")
        results["publications"] = []

    progress(0.85, desc="Fetching detailed data for top epitopes...")
    top = results["epitopes"].get("epitopes", [])[:3]
    detailed: list[Any] = []
    for ep in top:
        try:
            detailed.append(cached_get_epitope_details(ep["structure_id"], inputs["mutation"]))
        except Exception:
            detailed.append(None)
    results["detailed_epitopes"] = detailed

    progress(1.0, desc="Done")
    return _format_outputs(results)


# ---------------------------------------------------------------------------
# Output rendering
# ---------------------------------------------------------------------------

def _epitope_card_html(ep: dict, rank: int, detail: dict | None) -> str:
    seq = ep.get("linear_sequence", "N/A")
    alleles = ep.get("mhc_alleles") or []
    score = ep.get("score", 0)
    badge = (
        '<span style="display:inline-block;background:#e8f5e9;color:#2e7d32;'
        'font-size:0.82rem;font-weight:600;padding:3px 12px;border-radius:980px;">'
        'HLA Match</span>'
    ) if ep.get("hla_matched") else ""
    summary = summarize_epitope(ep)

    detail_html = ""
    if detail and not detail.get("error"):
        tcrs = detail.get("tcr_data", [])
        if tcrs:
            detail_html += "<p><b>TCR Sequences:</b></p><ul>"
            for tcr in tcrs[:5]:
                names = tcr.get("receptor_names") or []
                name_str = f" ({', '.join(names)})" if names else ""
                detail_html += (
                    f"<li><code>CDR3α: {tcr.get('chain1_cdr3', 'N/A')} | "
                    f"CDR3β: {tcr.get('chain2_cdr3', 'N/A')}{name_str}</code></li>"
                )
            detail_html += "</ul>"

        assays = detail.get("tcell_assays", [])
        if assays:
            positive = sum(1 for a in assays if (a.get("qualitative_measure") or "").startswith("Positive"))
            negative = sum(1 for a in assays if a.get("qualitative_measure") == "Negative")
            detail_html += (
                f"<p><b>T-cell Assay Summary:</b> Positive: {positive} | "
                f"Negative: {negative} | Total: {len(assays)}</p>"
            )
            types: dict[str, int] = {}
            for a in assays:
                key = a.get("assay_type") or "Unknown"
                types[key] = types.get(key, 0) + 1
            if types:
                detail_html += "<p><b>Assay types:</b> " + ", ".join(f"{k} ({v})" for k, v in types.items()) + "</p>"

        ligands = detail.get("mhc_ligands", [])
        if ligands:
            detail_html += f"<p><b>MHC Ligand Assays:</b> {len(ligands)}</p>"
    else:
        detail_html = "<p><i>Detailed data not available for this epitope.</i></p>"

    cedar_url = ep.get("cedar_url", "")
    cedar_link = f'<p><a href="{cedar_url}" target="_blank">View in CEDAR</a></p>' if cedar_url else ""

    return f"""
    <div style="border:1px solid #e0e0e0;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="flex:3;">
          <h3 style="margin:0 0 4px 0;">{seq}</h3>
          <div style="color:#666;font-size:0.85rem;margin-bottom:8px;">Rank {rank}</div>
          <p><b>HLA Restriction:</b> {', '.join(alleles) if alleles else 'N/A'}</p>
          <p><b>Mutation:</b> {ep.get('mutation', 'N/A')}</p>
          {badge}
          <p><i>{summary}</i></p>
        </div>
        <div style="flex:1;text-align:right;font-size:0.92rem;line-height:1.6;">
          <div><b>Score:</b> {score}/100</div>
          <div><b>T-cell Assays:</b> {ep.get('tcell_assay_count', 0)}</div>
          <div><b>TCRs:</b> {ep.get('tcr_count', 0)}</div>
          <div><b>PDB:</b> {len(ep.get('pdb_ids') or [])}</div>
        </div>
      </div>
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;">View details</summary>
        {detail_html}
        {cedar_link}
      </details>
    </div>
    """


def _trials_html(trials: list[dict]) -> str:
    if not trials:
        return "<p><i>No matching clinical trials found.</i></p>"
    out: list[str] = []
    for tr in trials:
        nct = tr.get("nct_id", "N/A")
        title = _esc(tr.get("title", "No title"))
        status = _esc(tr.get("status", "Unknown"))
        phase = _esc(tr.get("phase", "N/A"))
        conditions = _esc(tr.get("conditions", "N/A"))
        enrollment = tr.get("enrollment", "N/A")
        sponsor = _esc(tr.get("sponsor", "N/A"))
        summary = _esc((tr.get("brief_summary") or "")[:500])
        link = f'<p><a href="https://clinicaltrials.gov/study/{nct}" target="_blank">View on ClinicalTrials.gov</a></p>' if nct else ""
        out.append(f"""
        <details style="margin-bottom:6px;">
          <summary style="cursor:pointer;"><b>{nct}</b>: {title}</summary>
          <p><b>Status:</b> {status} &nbsp;|&nbsp; <b>Phase:</b> {phase}</p>
          <p><b>Conditions:</b> {conditions}</p>
          <p><b>Enrollment:</b> {enrollment} &nbsp;|&nbsp; <b>Sponsor:</b> {sponsor}</p>
          {f'<p><b>Summary:</b> {summary}…</p>' if summary else ''}
          {link}
        </details>
        """)
    return "".join(out)


def _publications_html(pubs: list[dict]) -> str:
    if not pubs:
        return "<p><i>No matching publications found.</i></p>"
    out: list[str] = []
    for pub in pubs[:10]:
        title = _esc(pub.get("title", "No title"))
        authors = _esc(pub.get("authors", ""))
        year = pub.get("year", "")
        journal = _esc(pub.get("journal", ""))
        pmid = pub.get("pmid", "")
        abstract = _esc(pub.get("abstract", ""))
        link = f'<a href="https://pubmed.ncbi.nlm.nih.gov/{pmid}" target="_blank">PubMed</a>' if pmid else ""
        out.append(f"""
        <div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;">
          <p style="margin:0 0 4px 0;"><b>{title}</b></p>
          <p style="margin:0 0 4px 0;"><i>{authors}</i> ({year})</p>
          <p style="margin:0 0 4px 0;">Journal: {journal}</p>
          {f'<details><summary style="cursor:pointer;">Abstract</summary><p>{abstract}</p></details>' if abstract else ''}
          <p style="margin:4px 0 0 0;">{link}</p>
        </div>
        """)
    return "".join(out)


def _hla_info_html(hla_info: list[dict]) -> str:
    if not hla_info:
        return "<p><i>No HLA information available.</i></p>"
    out: list[str] = []
    for info in hla_info:
        name = _esc(info.get("name", info.get("allele", "Unknown")))
        if info.get("valid"):
            citations = info.get("citations", [])
            cite_html = ""
            if citations:
                items = []
                for c in citations[:5]:
                    pmid = c.get("pubmed_id", "")
                    title = _esc(c.get("title", ""))
                    if pmid:
                        items.append(f'<li><a href="https://pubmed.ncbi.nlm.nih.gov/{pmid}" target="_blank">{title}</a></li>')
                    elif title:
                        items.append(f"<li>{title}</li>")
                if items:
                    cite_html = "<p><b>Citations:</b></p><ul>" + "".join(items) + "</ul>"
            out.append(f"""
            <details style="margin-bottom:6px;">
              <summary style="cursor:pointer;"><b>{name}</b> — Validated</summary>
              <p><b>Accession:</b> {info.get('accession', 'N/A')}</p>
              <p><b>Locus:</b> {info.get('locus', 'N/A')} &nbsp;|&nbsp; <b>Class:</b> {info.get('class', 'N/A')}</p>
              <p><b>Cell lines:</b> {info.get('cell_count', 0)}</p>
              {cite_html}
            </details>
            """)
        else:
            err = _esc(info.get("error", "Allele not found"))
            out.append(f"""
            <details style="margin-bottom:6px;">
              <summary style="cursor:pointer;"><b>{name}</b> — Not found in IMGT</summary>
              <p style="color:#b00;">{err}</p>
            </details>
            """)
    return "".join(out)


SCORING_MD = """
## How Epitopes Are Scored

Each epitope receives a composite score from 0–100 based on the strength of available evidence.
Higher scores indicate more robust experimental support for immunogenicity.

| Component | Max Points | How It's Calculated |
|-----------|------------|---------------------|
| **T-cell assays** | 25 | Log scale: 1 assay=5pts, 5 assays=15pts, 10+=25pts |
| **Positive response ratio** | 20 | % of T-cell assays showing positive response × 20 |
| **TCR sequences** | 20 | Known reactive T-cell receptors (scales 0–5+) |
| **PDB structure** | 10 | 3D crystal structure available (binary) |
| **MHC ligand assays** | 15 | Peptide–MHC binding evidence (scales 0–5+) |
| **HLA match** | +10 | Bonus if epitope MHC matches patient's HLA |

### Key Notes
- **Positive response ratio is critical**: 10 T-cell assays with only 2 positive results
  scores lower than 5 assays with 5 positive results.
- **HLA match** indicates the epitope may be presented by the patient's own MHC molecules.
- Scores help prioritize epitopes but should be interpreted alongside clinical context.
"""


def _write_temp(name: str, body: str) -> str:
    path = os.path.join(tempfile.gettempdir(), name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


def _format_outputs(results: dict):
    epitope_data = results.get("epitopes", {}) or {}
    epitopes = epitope_data.get("epitopes", []) or []
    trials = results.get("trials", []) or []
    publications = results.get("publications", []) or []
    hla_info = results.get("hla_info", []) or []
    detailed = results.get("detailed_epitopes", []) or []

    total_ep = epitope_data.get("total_count", 0)
    matched_ep = epitope_data.get("hla_matched_count", 0)
    total_assays = sum(e.get("tcell_assay_count", 0) for e in epitopes)

    metrics_md = (
        f"**Epitopes Found:** {total_ep}"
        + (f" ({matched_ep} HLA-matched)" if matched_ep else "")
        + f"  &nbsp;|&nbsp;  **T-cell Assays:** {total_assays}"
        + f"  &nbsp;|&nbsp;  **Clinical Trials:** {len(trials)}"
        + f"  &nbsp;|&nbsp;  **Publications:** {len(publications)}"
    )

    if epitopes:
        top_html = "".join(
            _epitope_card_html(ep, i + 1, detailed[i] if i < len(detailed) else None)
            for i, ep in enumerate(epitopes[:3])
        )
        rows = []
        for i, ep in enumerate(epitopes, 1):
            rows.append({
                "Rank": i,
                "Sequence": ep.get("linear_sequence", "N/A"),
                "Mutation": ep.get("mutation", ""),
                "Summary": summarize_epitope(ep),
                "HLA Match": "Yes" if ep.get("hla_matched") else "",
                "MHC Alleles": "; ".join(ep.get("mhc_alleles") or []),
                "T-cell Assays": ep.get("tcell_assay_count", 0),
                "TCRs": ep.get("tcr_count", 0),
                "PDB": "; ".join(ep.get("pdb_ids") or []),
            })
        all_df = pd.DataFrame(rows)
    else:
        top_html = "<p><i>No epitopes found for this mutation. Try removing the neoantigen filter in Advanced Options.</i></p>"
        all_df = pd.DataFrame()

    mutation_str = results.get("mutation", "unknown")
    ts = datetime.now().strftime("%Y%m%d")
    json_path = _write_temp(f"neocheck_{mutation_str}_{ts}.json", results_to_json(results))
    csv_path = _write_temp(f"neocheck_{mutation_str}_{ts}.csv", results_to_csv(results))
    html_path = _write_temp(f"neocheck_{mutation_str}_{ts}.html", generate_html_report(results))

    return (
        gr.update(visible=True),                    # results_section
        metrics_md,                                  # metrics_md
        top_html,                                    # top_html
        all_df,                                      # all_df
        json.dumps(epitope_data, indent=2, default=str),  # raw_json (gr.Code)
        _trials_html(trials),                        # trials_html
        _publications_html(publications),            # pubs_html
        _hla_info_html(hla_info),                    # hla_html
        gr.update(value=json_path, visible=True),    # json_dl
        gr.update(value=csv_path, visible=True),     # csv_dl
        gr.update(value=html_path, visible=True),    # html_dl
        results,                                     # results_state
    )


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

CSS = """
.gradio-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.gr-button-primary { font-weight: 600; }
"""


def _gene_hint(gene: str) -> str:
    g = (gene or "").strip().upper()
    if g in GENE_MUTATIONS:
        return f"*Common {g} mutations: {', '.join(GENE_MUTATIONS[g])}*"
    return ""


# ---------------------------------------------------------------------------
# Model selector helpers (Phase 3)
# ---------------------------------------------------------------------------

MODEL_LOCAL = "Local model (Qwen3)"
MODEL_ANTHROPIC = "Bring-your-own Anthropic key"


def _on_model_choice_change(choice: str):
    """Toggle the API key input visibility based on radio selection."""
    show_key = choice == MODEL_ANTHROPIC
    return (
        gr.update(visible=show_key),  # api_key textbox
        gr.update(visible=not show_key),  # use_fallback_local checkbox
    )


def _on_provider_inputs_change(choice: str, api_key: str, use_fallback: bool):
    """Pack the three inputs into a single state dict for downstream handlers."""
    return {
        "model_choice": choice,
        "anthropic_key": (api_key or "").strip() if choice == MODEL_ANTHROPIC else "",
        "use_fallback_local": bool(use_fallback) and choice == MODEL_LOCAL,
    }


def get_provider_from_state(provider_state: dict | None):
    """Construct an LLMProvider from the sidebar state dict.

    Used by Phase 4 chat handlers; exposed here so unit tests can exercise
    it without booting the UI.
    """
    state = provider_state or {}
    return _build_provider(
        anthropic_key=(state.get("anthropic_key") or None),
        use_fallback_local=bool(state.get("use_fallback_local")),
    )


# ---------------------------------------------------------------------------
# Chat (Phase 4)
# ---------------------------------------------------------------------------

def _initial_chat_state() -> dict:
    return {"messages": [], "history": [], "mcp_session": None, "active_model": None}


def _to_chatbot_messages(messages: list[dict]) -> list[dict]:
    """Strip rich metadata to gr.Chatbot's {role, content} format."""
    return [{"role": m["role"], "content": m.get("content", "")} for m in messages]


def _client_ip(request: gr.Request | None) -> str:
    if request is None:
        return "anon"
    try:
        xff = (request.headers or {}).get("x-forwarded-for", "") if request.headers else ""
        if xff:
            return xff.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
    except Exception:
        pass
    return "anon"


def _render_visualizations(messages: list[dict]) -> str:
    """Concatenate IMGT-style HTML visualizations from all assistant messages (newest first).

    Each visualization is wrapped in an iframe with srcdoc so its internal
    <style>/<script> can't bleed into the parent Gradio layout.
    """
    blocks: list[str] = []
    for msg in reversed(messages):
        for html_out in msg.get("html_outputs", []) or []:
            tool_name = html_out.get("tool", "visualization").replace("__", " › ")
            summary = html_out.get("summary") or {}
            summary_html = ""
            if summary:
                summary_html = (
                    '<div style="background:#e8f0ff;padding:8px 12px;border-radius:6px;'
                    'margin:8px 0;font-size:0.92rem;">'
                    f'<b>Summary:</b> {summary.get("protein_differences", "?")} '
                    f'protein differences, {summary.get("peptide_binding_differences", "?")} '
                    'in peptide binding sites</div>'
                )
            srcdoc = (html_out.get("html") or "").replace("&", "&amp;").replace('"', "&quot;")
            blocks.append(
                '<details open style="margin-bottom:16px;border:1px solid #e0e0e0;'
                'border-radius:8px;padding:8px;">'
                f'<summary style="cursor:pointer;"><b>📊 Visualization from {tool_name}</b></summary>'
                f'{summary_html}'
                f'<iframe srcdoc="{srcdoc}" width="100%" height="700" '
                'style="border:none;border-radius:6px;"></iframe>'
                '</details>'
            )
    return "".join(blocks)


def _render_tool_calls(messages: list[dict]) -> tuple[bool, str]:
    """Build a Markdown view of the most recent assistant message's tool calls."""
    for msg in reversed(messages):
        if msg["role"] == "assistant" and msg.get("tool_calls"):
            tcs = msg["tool_calls"]
            md_lines = []
            for tc in tcs:
                args_json = json.dumps(tc.get("args", {}), indent=2)
                md_lines.append(f"**{tc.get('tool', '?')}**\n```json\n{args_json}\n```")
            return True, "\n\n".join(md_lines)
    return False, ""


def _format_chat_context(results: dict | None) -> str:
    if not results:
        return "*Run an analysis above so the assistant has patient context.*"
    return (
        f"*Patient context: **{results.get('gene', '?')} {results.get('mutation', '?')}** "
        f"— HLA: {', '.join(results.get('hla_alleles', []))}*"
    )


async def handle_chat(
    user_message: str,
    chat_state: dict | None,
    provider_state: dict | None,
    results_state: dict | None,
    request: gr.Request,
    progress=gr.Progress(),
):
    """Async chat handler. Awaits ChatAnalyzer.send_message directly under Gradio's loop.

    Outputs (must match the order wired in build_ui):
        chatbot, chat_state, viz_html, tool_calls_acc (visibility),
        tool_calls_md, chat_input (clear), download_chat_btn
    """
    state = chat_state if chat_state is not None else _initial_chat_state()

    # Empty input → no-op
    if not user_message or not user_message.strip():
        return (
            _to_chatbot_messages(state["messages"]),
            state,
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(value=""),
            gr.update(),
        )

    # Need analysis results before chatting (mirrors app.py gating)
    if not results_state:
        gr.Warning("Run an analysis first so the assistant has patient context.")
        return (
            _to_chatbot_messages(state["messages"]),
            state,
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(value=user_message),
            gr.update(),
        )

    ip = _client_ip(request)
    if not _RATE_LIMITER.check(ip):
        gr.Warning("Rate limit reached. Try again in an hour.")
        return (
            _to_chatbot_messages(state["messages"]),
            state,
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(value=user_message),
            gr.update(),
        )

    # Append user message to local list immediately (so it appears in chatbot before LLM call)
    state["messages"].append({"role": "user", "content": user_message})

    # Lazy MCP init (per-session — matches ZeroGPU per-worker model)
    if state["mcp_session"] is None:
        progress(0.1, desc="Starting MCP servers (first message only)...")
        try:
            from clients.mcp_session import MCPSession

            state["mcp_session"] = MCPSession(MCP_SERVERS_CONFIG)
            await state["mcp_session"].ensure_started()
        except Exception as exc:
            state["messages"].append({
                "role": "assistant",
                "content": f"Could not start MCP servers: {exc}",
                "tool_calls": None,
            })
            return (
                _to_chatbot_messages(state["messages"]),
                state,
                gr.update(),
                gr.update(visible=False),
                gr.update(value=""),
                gr.update(value=""),
                gr.update(visible=False),
            )

    # Build provider on demand from the sidebar state
    is_local = (provider_state or {}).get("model_choice") == MODEL_LOCAL or not (provider_state or {}).get("anthropic_key")
    if is_local:
        progress(
            0.3,
            desc="Loading local model… first call downloads ~28 GB to the GPU worker (1–3 min). Subsequent messages are fast.",
        )
    else:
        progress(0.3, desc="Calling Anthropic API…")
    try:
        provider = get_provider_from_state(provider_state)
    except Exception as exc:
        state["messages"].append({
            "role": "assistant",
            "content": f"Could not initialize the model: {exc}",
            "tool_calls": None,
        })
        return (
            _to_chatbot_messages(state["messages"]),
            state,
            gr.update(),
            gr.update(visible=False),
            gr.update(value=""),
            gr.update(value=""),
            gr.update(visible=False),
        )
    state["active_model"] = provider.name

    from clients.chat_client import ChatAnalyzer, format_results_for_chat

    analyzer = ChatAnalyzer(provider=provider, mcp_manager=state["mcp_session"].manager)

    patient_context = format_results_for_chat(results_state) if not state["history"] else None

    progress(0.6, desc="Thinking… (running tool calls if needed)")
    try:
        result = await analyzer.send_message(
            user_message=user_message,
            conversation_history=state["history"],
            system_prompt=CHAT_SYSTEM_PROMPT,
            patient_context=patient_context,
        )
    except Exception as exc:
        state["messages"].append({
            "role": "assistant",
            "content": f"I encountered an error: {exc}",
            "tool_calls": None,
        })
        return (
            _to_chatbot_messages(state["messages"]),
            state,
            gr.update(),
            gr.update(visible=False),
            gr.update(value=""),
            gr.update(value=""),
            gr.update(visible=False),
        )

    state["messages"].append({
        "role": "assistant",
        "content": result["response"],
        "tool_calls": result["tool_calls"],
        "html_outputs": result.get("html_outputs", []),
    })
    state["history"] = result["updated_history"]

    progress(0.9, desc="Rendering response…")
    viz_html = _render_visualizations(state["messages"])
    has_tools, tool_md = _render_tool_calls(state["messages"])

    # Generate downloadable chat report
    mutation_str = (results_state or {}).get("mutation", "unknown")
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    report_path = _write_temp(
        f"neocheck_chat_{mutation_str}_{ts}.html",
        generate_chat_report(chat_messages=state["messages"], patient_context=results_state),
    )

    return (
        _to_chatbot_messages(state["messages"]),
        state,
        gr.update(value=viz_html, visible=bool(viz_html)),
        gr.update(visible=has_tools),
        gr.update(value=tool_md),
        gr.update(value=""),
        gr.update(value=report_path, visible=True),
    )


def reset_chat(chat_state: dict | None):
    """Clear chat history. MCP session reference is dropped; __del__ best-effort cleans up."""
    return (
        [],                                      # chatbot
        _initial_chat_state(),                   # chat_state
        gr.update(value="", visible=False),      # viz_html
        gr.update(visible=False),                # tool_calls_acc
        gr.update(value=""),                     # tool_calls_md
        gr.update(value=""),                     # chat_input
        gr.update(value=None, visible=False),    # download_chat_btn
    )


def submit_feedback_handler(rating, comment, email, chat_state, results_state):
    repo = os.environ.get("NEOCHECK_FEEDBACK_DATASET")
    token = os.environ.get("HF_TOKEN")
    if not repo or not token:
        gr.Warning("Feedback storage isn't configured for this deployment.")
        return
    if not rating:
        gr.Warning("Pick 👍 or 👎 first.")
        return

    state = chat_state or _initial_chat_state()
    last_user, last_asst = "", ""
    for msg in reversed(state.get("messages", [])):
        if not last_asst and msg["role"] == "assistant":
            last_asst = str(msg.get("content") or "")
        elif not last_user and msg["role"] == "user":
            last_user = str(msg.get("content") or "")
        if last_user and last_asst:
            break

    entry = FeedbackEntry(
        rating="up" if rating.startswith("👍") else "down",
        comment=(comment or None),
        email=(email or None),
        model=state.get("active_model") or "unknown",
        mutation=(results_state or {}).get("mutation"),
        hla=(results_state or {}).get("hla_alleles", []),
        last_user_msg=last_user,
        last_assistant_msg=last_asst,
    )
    try:
        submit_feedback(entry, repo_id=repo, token=token)
        gr.Info("Thanks! Feedback submitted.")
    except Exception as exc:  # noqa: BLE001
        gr.Warning(f"Could not submit feedback: {type(exc).__name__}: {exc}")


def build_ui() -> gr.Blocks:
    with gr.Blocks(title="NeoCheck") as demo:
        gr.Markdown("# 🧬 NeoCheck — Neoantigen HLA Compatibility Checker")
        gr.Markdown("*Data sources: CEDAR  |  IMGT/HLA  |  ClinicalTrials.gov  |  PubMed*")

        results_state = gr.State(None)
        provider_state = gr.State({
            "model_choice": MODEL_LOCAL,
            "anthropic_key": "",
            "use_fallback_local": False,
        })

        with gr.Row(equal_height=False):
            # ---- Sidebar (model selector) ----
            with gr.Column(scale=1, min_width=240):
                gr.Markdown("### Model")
                model_choice = gr.Radio(
                    choices=[MODEL_LOCAL, MODEL_ANTHROPIC],
                    value=MODEL_LOCAL,
                    label="LLM provider",
                    info="Local runs on the Space's GPU (ZeroGPU) — no key needed.",
                )
                anthropic_key = gr.Textbox(
                    label="Anthropic API key",
                    type="password",
                    placeholder="sk-ant-...",
                    visible=False,
                )
                use_fallback_local = gr.Checkbox(
                    label="Use smaller fallback model (Qwen3-4B)",
                    value=False,
                    visible=True,
                )
                gr.Markdown(
                    "<small>The chat tab (Phase 4) will use this selection.</small>"
                )

            # ---- Main content (form, results) ----
            with gr.Column(scale=4):
                with gr.Row(equal_height=False):
                    with gr.Column():
                        gr.Markdown("### Mutation Information")
                        gr.Markdown("**Quick examples**")
                        with gr.Row():
                            example_btns = [gr.Button(label, size="sm") for label in EXAMPLES.keys()]
                        gene = gr.Textbox(label="Gene", placeholder="e.g., KRAS, BRAF, TP53, EGFR, IDH1")
                        mutation = gr.Textbox(label="Mutation", placeholder="e.g., G12D, V600E, R132H")
                        gene_hint_md = gr.Markdown("")
                    with gr.Column():
                        gr.Markdown("### HLA Typing")
                        hla_a1 = gr.Textbox(label="HLA-A Allele 1", placeholder="e.g., A*02:01 or HLA-A*02:01")
                        hla_a2 = gr.Textbox(label="HLA-A Allele 2", placeholder="e.g., A*11:01")
                        hla_b1 = gr.Textbox(label="HLA-B Allele 1 (optional)", placeholder="e.g., B*07:02")
                        hla_b2 = gr.Textbox(label="HLA-B Allele 2 (optional)", placeholder="e.g., B*08:01")
                        hla_c1 = gr.Textbox(label="HLA-C Allele 1 (optional)", placeholder="e.g., C*07:01")
                        hla_c2 = gr.Textbox(label="HLA-C Allele 2 (optional)", placeholder="e.g., C*07:02")

                with gr.Accordion("Advanced Options", open=False):
                    cancer_type = gr.Dropdown(label="Cancer Type (optional)", choices=CANCER_TYPES, value=CANCER_TYPES[0])
                    neoantigen_only = gr.Checkbox(label="Neoantigen epitopes only", value=True)
                    max_epitopes = gr.Slider(10, 100, value=20, step=5, label="Max epitopes to retrieve")
                    max_trials = gr.Slider(5, 20, value=5, step=1, label="Max clinical trials")
                    max_pubs = gr.Slider(5, 20, value=5, step=1, label="Max publications")

                run_btn = gr.Button("Run Analysis", variant="primary", size="lg")

        with gr.Column(visible=False) as results_section:
            gr.Markdown("## Results")
            metrics_md = gr.Markdown()

            gr.Markdown("### Epitope Analysis")
            with gr.Tabs():
                with gr.Tab("Top Epitopes"):
                    top_html = gr.HTML()
                with gr.Tab("All Epitopes"):
                    all_df = gr.Dataframe(interactive=False, wrap=True, max_height=420)
                with gr.Tab("Scoring"):
                    gr.Markdown(SCORING_MD)
                with gr.Tab("Raw Data"):
                    # Code (text) is much lighter than gr.JSON's tree-renderer
                    # for large epitope payloads — the freeze after analysis was
                    # gr.JSON serializing every nested field client-side.
                    raw_json = gr.Code(language="json", interactive=False, max_lines=30)

            gr.Markdown("### Clinical Trials")
            trials_html = gr.HTML()
            gr.Markdown("### Publications")
            pubs_html = gr.HTML()
            gr.Markdown("### HLA Allele Information")
            hla_html = gr.HTML()

            gr.Markdown(
                "> **Disclaimer:** This tool is for research purposes only. "
                "Results should not be used for clinical decision-making without professional medical review."
            )

            gr.Markdown("### Export Results")
            with gr.Row():
                json_dl = gr.DownloadButton("Download JSON", visible=False)
                csv_dl = gr.DownloadButton("Download CSV", visible=False)
                html_dl = gr.DownloadButton("Download HTML Report", visible=False)

            # ---- AI Assistant (chat) ----
            gr.Markdown("## AI Assistant")
            chat_context_md = gr.Markdown(_format_chat_context(None))
            chat_state = gr.State(_initial_chat_state())

            chatbot = gr.Chatbot(height=520)
            viz_html = gr.HTML(visible=False)
            with gr.Accordion("Tool calls", open=False, visible=False) as tool_calls_acc:
                tool_calls_md = gr.Markdown()
            chat_input = gr.Textbox(
                placeholder="Ask about the patient's results…",
                lines=2,
                show_label=False,
            )
            with gr.Row():
                send_btn = gr.Button("Send", variant="primary", scale=4)
                new_chat_btn = gr.Button("New chat", scale=1)
            download_chat_btn = gr.DownloadButton("Download chat report", visible=False)

            with gr.Accordion("📣 Send feedback", open=False):
                gr.Markdown(
                    "<small>Help us improve NeoCheck. Do **not** paste patient identifiers. "
                    "Submissions are stored privately and read by the maintainer.</small>"
                )
                fb_rating = gr.Radio(
                    choices=["👍 Yes", "👎 No"],
                    label="Was this answer useful?",
                    value=None,
                )
                fb_comment = gr.Textbox(
                    label="What worked or what didn't?",
                    placeholder="Optional. Up to 1000 characters.",
                    lines=2,
                    max_length=1000,
                )
                fb_email = gr.Textbox(
                    label="Email (optional, for follow-up)",
                    placeholder="leave blank to stay anonymous",
                )
                fb_submit = gr.Button("Submit feedback")

        # ----- Sidebar wiring -----
        model_choice.change(
            fn=_on_model_choice_change,
            inputs=model_choice,
            outputs=[anthropic_key, use_fallback_local],
        )
        # Pack the three sidebar inputs into provider_state on every change.
        for ctrl in (model_choice, anthropic_key, use_fallback_local):
            ctrl.change(
                fn=_on_provider_inputs_change,
                inputs=[model_choice, anthropic_key, use_fallback_local],
                outputs=provider_state,
            )

        # ----- Wire example buttons → fill inputs -----
        for i, (_label, vals) in enumerate(EXAMPLES.items()):
            example_btns[i].click(
                fn=lambda v=vals: (
                    v["gene"], v["mutation"],
                    v["hla_a1"], v["hla_a2"],
                    v.get("hla_b1", ""), v.get("hla_b2", ""),
                    v.get("hla_c1", ""), v.get("hla_c2", ""),
                ),
                outputs=[gene, mutation, hla_a1, hla_a2, hla_b1, hla_b2, hla_c1, hla_c2],
            )

        # ----- Gene hint live update -----
        gene.change(fn=_gene_hint, inputs=gene, outputs=gene_hint_md)

        # ----- Run button -----
        run_btn.click(
            fn=run_analysis,
            inputs=[
                gene, mutation,
                hla_a1, hla_a2, hla_b1, hla_b2, hla_c1, hla_c2,
                cancer_type, neoantigen_only, max_epitopes, max_trials, max_pubs,
            ],
            outputs=[
                results_section, metrics_md, top_html, all_df, raw_json,
                trials_html, pubs_html, hla_html,
                json_dl, csv_dl, html_dl,
                results_state,
            ],
        )

        # ----- Patient context banner under the chat header -----
        results_state.change(
            fn=_format_chat_context,
            inputs=results_state,
            outputs=chat_context_md,
        )

        # ----- Chat wiring -----
        chat_outputs = [
            chatbot, chat_state,
            viz_html, tool_calls_acc, tool_calls_md,
            chat_input, download_chat_btn,
        ]
        chat_inputs = [chat_input, chat_state, provider_state, results_state]
        send_btn.click(handle_chat, inputs=chat_inputs, outputs=chat_outputs)
        chat_input.submit(handle_chat, inputs=chat_inputs, outputs=chat_outputs)
        new_chat_btn.click(reset_chat, inputs=chat_state, outputs=chat_outputs)

        # ----- Feedback -----
        fb_submit.click(
            submit_feedback_handler,
            inputs=[fb_rating, fb_comment, fb_email, chat_state, results_state],
            outputs=None,
        )

    return demo


# Module-level Blocks instance — HF Spaces' Gradio runner imports this
# module and calls `demo.launch()` itself, so `demo` must exist at import
# time. Local `python gradio_app.py` still works via the __main__ block.
demo = build_ui()

# Force ssr_mode=False for every caller (HF Spaces' runner overrides our
# env var; SSR's Node sidecar gets killed in the Spaces container). Wrap
# launch so we don't have to rely on env vars or constructor flags.
_orig_launch = demo.launch
def _launch_no_ssr(*args, **kwargs):
    kwargs.setdefault("ssr_mode", False)
    return _orig_launch(*args, **kwargs)
demo.launch = _launch_no_ssr

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", 7860)),
        css=CSS,
        theme=gr.themes.Soft(),
    )

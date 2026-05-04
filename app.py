"""NeoCheck: Neoantigen HLA Compatibility Checker.

Main Streamlit application.
"""

import json
import sys
import os
import base64
from datetime import datetime
from typing import Any

# Fix asyncio event loop issues with nested async calls (needed for MCP tool calls)
import nest_asyncio
nest_asyncio.apply()

import asyncio

def get_or_create_eventloop():
    """Get the current event loop or create a new one if needed.

    This ensures we reuse the same event loop across Streamlit reruns,
    which is critical for MCP servers that hold async state (locks, subprocesses).
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop

# Initialize the event loop early, before any async operations
_event_loop = get_or_create_eventloop()

import streamlit as st
import pandas as pd

# Add neocheck directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import GENE_MUTATIONS, EXAMPLES, CANCER_TYPES, AI_MODEL, CHAT_SYSTEM_PROMPT, MCP_SERVERS_CONFIG
from utils.validators import (
    validate_mutation,
    validate_hla_allele,
    normalize_hla_allele,
    normalize_hla_allele_full,
)
from utils.formatters import results_to_json, results_to_csv, generate_html_report, generate_chat_report
from utils.scoring import summarize_epitope


def _esc(text: str) -> str:
    """Escape markdown special characters (especially * in HLA allele names)."""
    return text.replace("*", "\\*")


def render_html_visualization(html_content: str, height: int = 600) -> None:
    """Render HTML visualization directly in the Streamlit app using an iframe.

    This approach embeds the visualization inline rather than opening a new tab,
    which avoids browser security restrictions on data URLs.
    """
    import streamlit.components.v1 as components

    # Render the HTML directly in an iframe component
    components.html(html_content, height=height, scrolling=True)


# -- Page config --
st.set_page_config(
    page_title="NeoCheck",
    page_icon="N",
    layout="wide",
)

# -- Apple-inspired CSS --
st.markdown("""
<style>
/* ========================================
   APPLE-INSPIRED THEME FOR NEOCHECK
   ======================================== */

/* --- Global Typography --- */
html, body, [class*="css"] {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
                 'Inter', 'Helvetica Neue', sans-serif;
}

/* Main container — reduced top padding, constrained width */
.main .block-container {
    padding-top: 1rem;
    padding-bottom: 3rem;
    padding-left: 4rem;
    padding-right: 4rem;
    max-width: 1200px;
}

/* --- Headings --- */
h1 {
    font-weight: 600 !important;
    font-size: 2.4rem !important;
    letter-spacing: -0.02em !important;
    color: #1d1d1f !important;
}

h2 {
    font-weight: 500 !important;
    font-size: 1.6rem !important;
    letter-spacing: -0.01em !important;
    color: #1d1d1f !important;
    margin-top: 2.5rem !important;
    margin-bottom: 1rem !important;
}

h3 {
    font-weight: 500 !important;
    font-size: 1.2rem !important;
    color: #1d1d1f !important;
    letter-spacing: -0.005em !important;
}

/* --- Body text --- */
p, li, span, label {
    font-weight: 400;
    color: #1d1d1f;
    line-height: 1.6;
}

.stCaption, [data-testid="stCaptionContainer"] {
    color: #86868b !important;
    font-size: 0.85rem !important;
}

/* --- Cards (st.container with border) --- */
[data-testid="stVerticalBlockBorderWrapper"] {
    border: none !important;
    border-radius: 16px !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04) !important;
    padding: 1.5rem !important;
    margin-bottom: 1rem !important;
    transition: box-shadow 0.2s ease;
}

[data-testid="stVerticalBlockBorderWrapper"]:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04) !important;
}

/* --- Primary Buttons (pill) --- */
[data-testid="stBaseButton-primary"] {
    background-color: #0071e3 !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 980px !important;
    padding: 0.65rem 1.8rem !important;
    font-weight: 500 !important;
    font-size: 0.95rem !important;
    transition: background-color 0.2s ease, transform 0.1s ease;
}

[data-testid="stBaseButton-primary"]:hover {
    background-color: #0077ed !important;
    transform: scale(1.01);
}

[data-testid="stBaseButton-primary"]:active {
    background-color: #006edb !important;
    transform: scale(0.99);
}

/* --- Secondary Buttons (ghost) --- */
[data-testid="stBaseButton-secondary"] {
    background-color: transparent !important;
    color: #0071e3 !important;
    border: 1px solid #d2d2d7 !important;
    border-radius: 980px !important;
    padding: 0.5rem 1.4rem !important;
    font-weight: 500 !important;
    font-size: 0.88rem !important;
    transition: background-color 0.2s ease, border-color 0.2s ease;
}

[data-testid="stBaseButton-secondary"]:hover {
    background-color: rgba(0,113,227,0.04) !important;
    border-color: #0071e3 !important;
}

/* --- Download Buttons --- */
[data-testid="stDownloadButton"] button {
    background-color: transparent !important;
    color: #0071e3 !important;
    border: 1.5px solid #d2d2d7 !important;
    border-radius: 980px !important;
    padding: 0.55rem 1.5rem !important;
    font-weight: 500 !important;
    font-size: 0.88rem !important;
    transition: all 0.2s ease;
}

[data-testid="stDownloadButton"] button:hover {
    background-color: #0071e3 !important;
    color: #ffffff !important;
    border-color: #0071e3 !important;
}

/* --- Text Inputs --- */
[data-testid="stTextInput"] input {
    border: 1px solid #d2d2d7 !important;
    border-radius: 12px !important;
    padding: 0.65rem 1rem !important;
    font-size: 0.95rem !important;
    background-color: #ffffff !important;
    color: #1d1d1f !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

[data-testid="stTextInput"] input:focus {
    border-color: #0071e3 !important;
    box-shadow: 0 0 0 3px rgba(0,113,227,0.15) !important;
    outline: none !important;
}

[data-testid="stTextInput"] label {
    font-weight: 500 !important;
    font-size: 0.88rem !important;
    color: #1d1d1f !important;
}

/* --- Text Area --- */
[data-testid="stTextArea"] textarea {
    border: 1px solid #d2d2d7 !important;
    border-radius: 12px !important;
    padding: 0.75rem 1rem !important;
    font-size: 0.95rem !important;
    background-color: #ffffff !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

[data-testid="stTextArea"] textarea:focus {
    border-color: #0071e3 !important;
    box-shadow: 0 0 0 3px rgba(0,113,227,0.15) !important;
}

/* --- Select Boxes --- */
[data-testid="stSelectbox"] > div > div {
    border: 1px solid #d2d2d7 !important;
    border-radius: 12px !important;
    background-color: #ffffff !important;
}

/* --- Metrics --- */
[data-testid="stMetric"] {
    background: #ffffff;
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    text-align: center;
}

[data-testid="stMetricValue"] {
    font-size: 2rem !important;
    font-weight: 600 !important;
    color: #1d1d1f !important;
    letter-spacing: -0.02em !important;
}

[data-testid="stMetricLabel"] {
    font-size: 0.82rem !important;
    font-weight: 500 !important;
    color: #86868b !important;
    text-transform: uppercase !important;
    letter-spacing: 0.04em !important;
}

[data-testid="stMetricDelta"] {
    font-size: 0.8rem !important;
    color: #86868b !important;
}

/* --- Expanders --- */
[data-testid="stExpander"] {
    border: 1px solid #e8e8ed !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    overflow: hidden;
    margin-bottom: 0.75rem !important;
}

[data-testid="stExpander"] details summary {
    font-weight: 500 !important;
    font-size: 0.95rem !important;
    color: #1d1d1f !important;
    padding: 0.75rem 1rem !important;
}

[data-testid="stExpander"] details summary:hover {
    background-color: #f5f5f7 !important;
}

/* --- Tabs --- */
[data-testid="stTabs"] [role="tablist"] {
    gap: 0 !important;
    border-bottom: 1px solid #e8e8ed !important;
}

[data-testid="stTabs"] button[role="tab"] {
    font-weight: 500 !important;
    font-size: 0.9rem !important;
    color: #86868b !important;
    border-bottom: 2px solid transparent !important;
    padding: 0.75rem 1.5rem !important;
    background: transparent !important;
    border-radius: 0 !important;
    transition: color 0.2s ease, border-color 0.2s ease;
}

[data-testid="stTabs"] button[role="tab"][aria-selected="true"] {
    color: #0071e3 !important;
    border-bottom: 2px solid #0071e3 !important;
    font-weight: 600 !important;
}

[data-testid="stTabs"] button[role="tab"]:hover {
    color: #1d1d1f !important;
}

/* --- DataFrames --- */
[data-testid="stDataFrame"] {
    border-radius: 12px !important;
    overflow: hidden;
    border: 1px solid #e8e8ed !important;
}

/* --- Progress Bar --- */
.stProgress > div > div {
    background-color: #0071e3 !important;
    border-radius: 980px !important;
    height: 4px !important;
}

.stProgress > div {
    background-color: #e8e8ed !important;
    border-radius: 980px !important;
    height: 4px !important;
}

/* --- Alerts --- */
[data-testid="stAlert"] {
    border-radius: 12px !important;
    border: none !important;
    font-size: 0.9rem !important;
}

/* --- Code Blocks --- */
code {
    background: #f5f5f7 !important;
    color: #1d1d1f !important;
    border-radius: 6px !important;
    padding: 2px 8px !important;
    font-size: 0.88rem !important;
}

/* --- Links --- */
a {
    color: #0071e3 !important;
    text-decoration: none !important;
}
a:hover {
    text-decoration: underline !important;
}

/* --- Horizontal Rules (subtle) --- */
hr {
    border: none !important;
    height: 1px !important;
    background: #e8e8ed !important;
    margin: 2.5rem 0 !important;
}

/* --- JSON viewer --- */
[data-testid="stJson"] {
    border-radius: 12px !important;
    border: 1px solid #e8e8ed !important;
}

/* --- Sliders --- */
[data-testid="stSlider"] [role="slider"] {
    background-color: #0071e3 !important;
}

/* --- Hide Streamlit branding --- */
#MainMenu { visibility: hidden; }
footer { visibility: hidden; }
header { visibility: hidden; }
</style>
""", unsafe_allow_html=True)

# -- Header --
st.title("NeoCheck")
st.markdown(
    '<p style="font-size: 1.1rem; color: #86868b; font-weight: 400; margin-top: -0.5rem;">'
    'Analyze cancer mutations and HLA types to identify personalized immunotherapy opportunities.'
    '</p>',
    unsafe_allow_html=True,
)
st.caption("Data sources: CEDAR  |  IMGT/HLA  |  ClinicalTrials.gov  |  PubMed")

# ============================================================
# Input Section
# ============================================================

def _load_example(vals: dict):
    """Callback for example buttons. Runs before next script execution."""
    st.session_state["gene_select"] = vals["gene"]
    st.session_state["mutation_select"] = vals["mutation"]
    st.session_state["hla_a1_input"] = vals["hla_a1"]
    st.session_state["hla_a2_input"] = vals["hla_a2"]
    st.session_state["hla_b1_input"] = vals.get("hla_b1", "")
    st.session_state["hla_b2_input"] = vals.get("hla_b2", "")
    st.session_state["hla_c1_input"] = vals.get("hla_c1", "")
    st.session_state["hla_c2_input"] = vals.get("hla_c2", "")


col_mut, col_hla = st.columns(2, gap="large")

with col_mut:
    st.subheader("Mutation Information")

    # Example buttons (placed before widgets so callback sets state before render)
    st.caption("Quick examples")
    example_cols = st.columns(len(EXAMPLES))
    for i, (label, vals) in enumerate(EXAMPLES.items()):
        with example_cols[i]:
            st.button(label, key=f"example_{i}", on_click=_load_example, args=(vals,))

    gene = st.text_input("Gene", key="gene_select", placeholder="e.g., KRAS, BRAF, TP53, EGFR, IDH1").strip().upper()
    mutation_input = st.text_input("Mutation", key="mutation_select", placeholder="e.g., G12D, V600E, R132H").strip().upper()

    # Show common mutation suggestions for known genes
    if gene in GENE_MUTATIONS:
        st.caption(f"Common {gene} mutations: {', '.join(GENE_MUTATIONS[gene])}")

with col_hla:
    st.subheader("HLA Typing")
    hla_a1 = st.text_input(
        "HLA-A Allele 1",
        key="hla_a1_input",
        placeholder="e.g., A*02:01 or HLA-A*02:01",
    )
    hla_a2 = st.text_input(
        "HLA-A Allele 2",
        key="hla_a2_input",
        placeholder="e.g., A*11:01",
    )
    hla_b1 = st.text_input(
        "HLA-B Allele 1 (optional)",
        key="hla_b1_input",
        placeholder="e.g., B*07:02",
    )
    hla_b2 = st.text_input(
        "HLA-B Allele 2 (optional)",
        key="hla_b2_input",
        placeholder="e.g., B*08:01",
    )
    hla_c1 = st.text_input(
        "HLA-C Allele 1 (optional)",
        key="hla_c1_input",
        placeholder="e.g., C*07:01 or HLA-C*07:01",
    )
    hla_c2 = st.text_input(
        "HLA-C Allele 2 (optional)",
        key="hla_c2_input",
        placeholder="e.g., C*07:02",
    )

# Advanced options
with st.expander("Advanced Options"):
    cancer_type = st.selectbox("Cancer Type (optional)", CANCER_TYPES)
    neoantigen_only = st.checkbox("Neoantigen epitopes only", value=True)
    max_epitopes = st.slider("Max epitopes to retrieve", 10, 100, 50)
    max_trials = st.slider("Max clinical trials", 5, 20, 10)
    max_pubs = st.slider("Max publications", 5, 20, 10)


# ============================================================
# Validation
# ============================================================

def get_validated_inputs() -> dict[str, Any] | None:
    """Validate all inputs and return cleaned values or None."""
    errors = []

    # Gene validation
    if not gene:
        errors.append("Gene name is required.")

    # Mutation validation
    mut_valid, mut_msg = validate_mutation(mutation_input)
    if not mut_valid:
        errors.append(mut_msg)

    # HLA validation
    hla_alleles = []
    for label, val in [("HLA-A1", hla_a1), ("HLA-A2", hla_a2), ("HLA-B1", hla_b1), ("HLA-B2", hla_b2), ("HLA-C1", hla_c1), ("HLA-C2", hla_c2)]:
        if val.strip():
            valid, msg = validate_hla_allele(val)
            if not valid:
                errors.append(f"{label}: {msg}")
            else:
                normalized = normalize_hla_allele(val)
                if normalized:
                    hla_alleles.append(normalized)

    if not hla_alleles:
        errors.append("At least one HLA allele is required.")

    if errors:
        for e in errors:
            st.error(e)
        return None

    return {
        "gene": gene,
        "mutation": mutation_input.strip().upper(),
        "hla_alleles": hla_alleles,
        "cancer_type": cancer_type,
        "neoantigen_only": neoantigen_only,
        "max_epitopes": max_epitopes,
        "max_trials": max_trials,
        "max_pubs": max_pubs,
    }


# ============================================================
# Cached API calls
# ============================================================

@st.cache_data(ttl=86400, show_spinner=False)
def cached_search_epitopes(mutation: str, hla_alleles_tuple: tuple, neoantigen_only: bool, limit: int):
    from analyzers.epitope_analyzer import search_epitopes_for_mutation
    return search_epitopes_for_mutation(
        mutation=mutation,
        hla_alleles=list(hla_alleles_tuple),
        neoantigen_only=neoantigen_only,
        limit=limit,
    )


@st.cache_data(ttl=86400, show_spinner=False)
def cached_get_epitope_details(structure_id: int, mutation: str | None = None):
    from analyzers.epitope_analyzer import get_epitope_details
    return get_epitope_details(structure_id, mutation=mutation)


@st.cache_data(ttl=604800, show_spinner=False)
def cached_fetch_hla_info(allele_names_tuple: tuple):
    from analyzers.hla_analyzer import fetch_all_hla_info
    return fetch_all_hla_info(list(allele_names_tuple))


@st.cache_data(ttl=3600, show_spinner=False)
def cached_search_trials(gene: str, mutation: str, cancer_type: str, max_results: int):
    from analyzers.trial_analyzer import search_relevant_trials
    ct = cancer_type if cancer_type != "Any" else None
    return search_relevant_trials(gene, mutation, cancer_type=ct, max_results=max_results)


@st.cache_data(ttl=86400, show_spinner=False)
def cached_search_publications(gene: str, mutation: str, max_results: int):
    from analyzers.publication_analyzer import search_publications
    return search_publications(gene, mutation, max_results=max_results)


# ============================================================
# Run Analysis
# ============================================================

if st.button("Run Analysis", type="primary", use_container_width=True):
    inputs = get_validated_inputs()
    if inputs:
        results: dict[str, Any] = {
            "gene": inputs["gene"],
            "mutation": inputs["mutation"],
            "hla_alleles": inputs["hla_alleles"],
        }

        status_text = st.empty()
        progress_bar = st.progress(0)

        status_text.caption("Starting analysis...")

        # Step 1: Epitope search
        status_text.caption("Searching CEDAR for epitopes...")
        progress_bar.progress(10)
        try:
            epitope_results = cached_search_epitopes(
                mutation=inputs["mutation"],
                hla_alleles_tuple=tuple(inputs["hla_alleles"]),
                neoantigen_only=inputs["neoantigen_only"],
                limit=inputs["max_epitopes"],
            )
            results["epitopes"] = epitope_results
        except Exception as e:
            st.error(f"CEDAR epitope search failed: {e}")
            results["epitopes"] = {"epitopes": [], "total_count": 0, "hla_matched_count": 0}

        # Step 2: HLA validation
        status_text.caption("Validating HLA alleles with IMGT...")
        progress_bar.progress(30)
        try:
            # Build full allele names for IMGT
            full_alleles = []
            for a in inputs["hla_alleles"]:
                full = normalize_hla_allele_full(a)
                full_alleles.append(full or a.replace("HLA-", ""))
            hla_info = cached_fetch_hla_info(tuple(full_alleles))
            results["hla_info"] = hla_info
        except Exception as e:
            st.warning(f"IMGT HLA lookup: {e}")
            results["hla_info"] = []

        # Step 3: Clinical trials
        status_text.caption("Searching ClinicalTrials.gov...")
        progress_bar.progress(50)
        try:
            trials = cached_search_trials(
                inputs["gene"], inputs["mutation"],
                inputs["cancer_type"], inputs["max_trials"],
            )
            results["trials"] = trials
        except Exception as e:
            st.warning(f"Clinical trials search: {e}")
            results["trials"] = []

        # Step 4: Publications
        status_text.caption("Searching PubMed...")
        progress_bar.progress(70)
        try:
            publications = cached_search_publications(
                inputs["gene"], inputs["mutation"], inputs["max_pubs"],
            )
            results["publications"] = publications
        except Exception as e:
            st.warning(f"PubMed search: {e}")
            results["publications"] = []

        # Step 5: Get details for top epitopes
        status_text.caption("Fetching detailed data for top epitopes...")
        progress_bar.progress(85)
        top_epitopes = results["epitopes"].get("epitopes", [])[:3]
        detailed_epitopes = []
        for ep in top_epitopes:
            try:
                detail = cached_get_epitope_details(ep["structure_id"], inputs["mutation"])
                detailed_epitopes.append(detail)
            except Exception:
                detailed_epitopes.append(None)
        results["detailed_epitopes"] = detailed_epitopes

        progress_bar.progress(100)
        status_text.empty()
        progress_bar.empty()
        st.session_state["results"] = results


def _render_epitope_card(ep: dict[str, Any], rank: int, detail: dict[str, Any] | None):
    """Render a single epitope card in the top epitopes tab."""
    with st.container(border=True):
        c1, c2 = st.columns([3, 1])

        with c1:
            seq = ep.get("linear_sequence", "N/A")
            st.markdown(f"### {seq}")
            st.caption(f"Rank {rank}")
            alleles = ep.get("mhc_alleles") or []
            st.markdown(f"**HLA Restriction:** {', '.join(_esc(a) for a in alleles) if alleles else 'N/A'}")
            st.markdown(f"**Mutation:** {ep.get('mutation', 'N/A')}")

            if ep.get("hla_matched"):
                st.markdown(
                    '<span style="display:inline-block;background:#e8f5e9;color:#2e7d32;'
                    'font-size:0.82rem;font-weight:600;padding:3px 12px;border-radius:980px;">'
                    'HLA Match</span>',
                    unsafe_allow_html=True,
                )

            # Summary sentence instead of numeric score
            summary = summarize_epitope(ep)
            st.markdown(f"*{_esc(summary)}*")

        with c2:
            score = ep.get("score", 0)
            st.metric("Score", f"{score}/100")
            st.metric("T-cell Assays", ep.get("tcell_assay_count", 0))
            st.metric("TCRs", ep.get("tcr_count", 0))
            pdb = ep.get("pdb_ids") or []
            st.metric("PDB Structures", len(pdb))

        # Expandable details
        with st.expander("View Details"):
            if detail and not detail.get("error"):
                # TCR sequences
                tcr_data = detail.get("tcr_data", [])
                if tcr_data:
                    st.markdown("**TCR Sequences:**")
                    for tcr in tcr_data[:5]:
                        names = tcr.get("receptor_names") or []
                        name_str = f" ({', '.join(names)})" if names else ""
                        st.code(
                            f"CDR3\u03b1: {tcr.get('chain1_cdr3', 'N/A')}\n"
                            f"CDR3\u03b2: {tcr.get('chain2_cdr3', 'N/A')}{name_str}"
                        )

                # T-cell assay summary
                tcell_assays = detail.get("tcell_assays", [])
                if tcell_assays:
                    st.markdown("**T-cell Assay Summary:**")
                    positive = sum(1 for a in tcell_assays if (a.get("qualitative_measure") or "").startswith("Positive"))
                    negative = sum(1 for a in tcell_assays if a.get("qualitative_measure") == "Negative")
                    st.markdown(f"- Positive: {positive} | Negative: {negative} | Total: {len(tcell_assays)}")

                    # Assay types
                    assay_types: dict[str, int] = {}
                    for a in tcell_assays:
                        atype = a.get("assay_type") or "Unknown"
                        assay_types[atype] = assay_types.get(atype, 0) + 1
                    if assay_types:
                        st.markdown("**Assay types:** " + ", ".join(f"{k} ({v})" for k, v in assay_types.items()))

                # MHC ligand summary
                mhc_ligands = detail.get("mhc_ligands", [])
                if mhc_ligands:
                    st.markdown(f"**MHC Ligand Assays:** {len(mhc_ligands)}")
            else:
                st.info("Detailed data not available for this epitope.")

            cedar_url = ep.get("cedar_url", "")
            if cedar_url:
                st.markdown(f"[View in CEDAR]({cedar_url})")


# ============================================================
# Display Results
# ============================================================

if "results" in st.session_state:
    results = st.session_state["results"]
    epitope_data = results.get("epitopes", {})
    epitopes = epitope_data.get("epitopes", [])
    trials = results.get("trials", [])
    publications = results.get("publications", [])
    hla_info = results.get("hla_info", [])
    detailed_epitopes = results.get("detailed_epitopes", [])

    st.header("Results")

    # -- Summary metrics --
    m1, m2, m3, m4 = st.columns(4)
    total_ep = epitope_data.get("total_count", 0)
    matched_ep = epitope_data.get("hla_matched_count", 0)
    total_assays = sum(e.get("tcell_assay_count", 0) for e in epitopes)

    m1.metric("Epitopes Found", total_ep, delta=f"{matched_ep} HLA-matched" if matched_ep else None)
    m2.metric("T-cell Assays", total_assays)
    m3.metric("Clinical Trials", len(trials))
    m4.metric("Publications", len(publications))

    # -- Epitope Rankings --
    st.header("Epitope Analysis")

    if not epitopes:
        st.info("No epitopes found for this mutation. Try removing the neoantigen filter in Advanced Options.")
    else:
        tab_top, tab_all, tab_scoring, tab_raw = st.tabs(["Top Epitopes", "All Epitopes", "Scoring", "Raw Data"])

        with tab_top:
            for i, ep in enumerate(epitopes[:3]):
                detail = detailed_epitopes[i] if i < len(detailed_epitopes) else None
                _render_epitope_card(ep, i + 1, detail)

        with tab_all:
            # DataFrame view
            df_data = []
            for i, ep in enumerate(epitopes, 1):
                df_data.append({
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
            st.dataframe(pd.DataFrame(df_data), use_container_width=True, hide_index=True)

        with tab_scoring:
            st.markdown("""
## How Epitopes Are Scored

Each epitope receives a composite score from 0-100 based on the strength of available evidence.
Higher scores indicate more robust experimental support for immunogenicity.

| Component | Max Points | How It's Calculated |
|-----------|------------|---------------------|
| **T-cell assays** | 25 | Log scale: 1 assay=5pts, 5 assays=15pts, 10+=25pts |
| **Positive response ratio** | 20 | % of T-cell assays showing positive response × 20 |
| **TCR sequences** | 20 | Known reactive T-cell receptors (scales 0-5+) |
| **PDB structure** | 10 | 3D crystal structure available (binary) |
| **MHC ligand assays** | 15 | Peptide-MHC binding evidence (scales 0-5+) |
| **HLA match** | +10 | Bonus if epitope MHC matches patient's HLA |

### Key Notes
- **Positive response ratio is critical**: 10 T-cell assays with only 2 positive results
  scores lower than 5 assays with 5 positive results
- **HLA match** indicates the epitope may be presented by the patient's own MHC molecules
- Scores help prioritize epitopes but should be interpreted alongside clinical context
""")

        with tab_raw:
            st.json(epitope_data)

    # -- Clinical Trials --
    st.header("Clinical Trials")
    if not trials:
        st.info("No matching clinical trials found.")
    else:
        for trial in trials:
            with st.expander(f"{trial.get('nct_id', 'N/A')}: {_esc(trial.get('title', 'No title'))}"):
                tc1, tc2 = st.columns(2)
                with tc1:
                    st.markdown(f"**Status:** {_esc(trial.get('status', 'Unknown'))}")
                    st.markdown(f"**Phase:** {_esc(trial.get('phase', 'N/A'))}")
                    st.markdown(f"**Conditions:** {_esc(trial.get('conditions', 'N/A'))}")
                with tc2:
                    st.markdown(f"**Enrollment:** {trial.get('enrollment', 'N/A')}")
                    st.markdown(f"**Sponsor:** {_esc(trial.get('sponsor', 'N/A'))}")
                if trial.get("brief_summary"):
                    st.markdown(f"**Summary:** {_esc(trial['brief_summary'][:500])}...")
                nct = trial.get("nct_id", "")
                if nct:
                    st.markdown(f"[View on ClinicalTrials.gov](https://clinicaltrials.gov/study/{nct})")

    # -- Publications --
    st.header("Publications")
    if not publications:
        st.info("No matching publications found.")
    else:
        for pub in publications[:10]:
            with st.container(border=True):
                st.markdown(f"**{_esc(pub.get('title', 'No title'))}**")
                st.markdown(f"*{_esc(pub.get('authors', ''))}* ({pub.get('year', '')})")
                st.markdown(f"Journal: {_esc(pub.get('journal', ''))}")
                if pub.get("abstract"):
                    with st.expander("Abstract"):
                        st.markdown(_esc(pub["abstract"]))
                pmid = pub.get("pmid", "")
                if pmid:
                    st.markdown(f"[PubMed](https://pubmed.ncbi.nlm.nih.gov/{pmid})")

    # -- HLA Info --
    st.header("HLA Allele Information")
    if hla_info:
        for info in hla_info:
            name = info.get("name", info.get("allele", "Unknown"))
            if info.get("valid"):
                with st.expander(f"{_esc(name)} - Validated"):
                    st.markdown(f"**Accession:** {info.get('accession', 'N/A')}")
                    st.markdown(f"**Locus:** {info.get('locus', 'N/A')}")
                    st.markdown(f"**Class:** {info.get('class', 'N/A')}")
                    st.markdown(f"**Cell lines:** {info.get('cell_count', 0)}")
                    citations = info.get("citations", [])
                    if citations:
                        st.markdown("**Citations:**")
                        for c in citations[:5]:
                            pmid = c.get("pubmed_id", "")
                            title = c.get("title", "")
                            if pmid:
                                st.markdown(f"- [{title}](https://pubmed.ncbi.nlm.nih.gov/{pmid})")
                            elif title:
                                st.markdown(f"- {title}")
            else:
                with st.expander(f"{_esc(name)} - Not found in IMGT"):
                    st.warning(info.get("error", "Allele not found"))
    else:
        st.info("No HLA information available.")

    # -- Disclaimer --
    st.warning(
        "**Disclaimer:** This tool is for research purposes only. "
        "Results should not be used for clinical decision-making without professional medical review."
    )

    # -- Export buttons --
    st.header("Export Results")
    exp1, exp2, exp3 = st.columns(3)
    mutation_str = results.get("mutation", "unknown")
    ts = datetime.now().strftime("%Y%m%d")

    with exp1:
        st.download_button(
            "Download JSON",
            data=results_to_json(results),
            file_name=f"neocheck_{mutation_str}_{ts}.json",
            mime="application/json",
        )
    with exp2:
        st.download_button(
            "Download CSV",
            data=results_to_csv(results),
            file_name=f"neocheck_{mutation_str}_{ts}.csv",
            mime="text/csv",
        )
    with exp3:
        st.download_button(
            "Download HTML Report",
            data=generate_html_report(results),
            file_name=f"neocheck_{mutation_str}_{ts}.html",
            mime="text/html",
        )

    # ============================================================
    # AI Chat Section
    # ============================================================

    st.header("AI Assistant")
    st.markdown(
        "Chat with Claude AI about your patient's results. "
        "Claude can query CEDAR, IMGT/HLA, ClinicalTrials.gov, and PubMed for additional context."
    )

    # --- Setup: API key ---
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if env_key:
        st.caption("API key loaded from environment variable.")
        api_key = env_key
    else:
        api_key = st.text_input(
            "Anthropic API Key",
            type="password",
            key="anthropic_api_key",
            placeholder="sk-ant-...",
            help="Get your key at console.anthropic.com",
        )

    # Model selection in sidebar-style expander
    with st.expander("Settings", expanded=False):
        model = st.selectbox(
            "Model",
            options=[
                "claude-haiku-4-5",                 # Claude Haiku 4.5 (latest, fast, cheap) - DEFAULT
                "claude-sonnet-4-20250514",         # Claude Sonnet 4 (newest, best accuracy)
                "claude-3-7-sonnet-20250219",       # Claude 3.7 Sonnet (very capable)
                "claude-3-5-sonnet-20241022",       # Claude 3.5 Sonnet (stable fallback)
            ],
            index=0,  # Default to Haiku
            key="chat_model",
            help="Haiku is fast and cheap. Use Sonnet models for more complex analysis.",
        )

    # Check MCP server availability
    mcp_available = True
    missing_servers = []
    for name, cfg in MCP_SERVERS_CONFIG.items():
        cwd = cfg.get("cwd", "")
        if name == "pubmed":
            if not os.path.isdir(cwd):
                missing_servers.append(name)
        else:
            dist_path = os.path.join(cwd, "dist", "index.js")
            if not os.path.isfile(dist_path):
                missing_servers.append(name)

    if missing_servers:
        mcp_available = False
        st.warning(
            f"MCP servers not built: **{', '.join(missing_servers)}**. "
            "See README for build instructions."
        )

    # --- Initialize chat session state ---
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "mcp_session" not in st.session_state:
        st.session_state.mcp_session = None
    if "chat_processing" not in st.session_state:
        st.session_state.chat_processing = False

    # --- Context banner ---
    st.caption(
        f"Patient context: **{results.get('gene', '?')} {results.get('mutation', '?')}** | "
        f"HLA: {', '.join(_esc(a) for a in results.get('hla_alleles', []))}"
    )

    # --- Display chat history ---
    for msg in st.session_state.chat_messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

            # Render saved HTML visualizations
            for html_out in msg.get("html_outputs", []):
                st.divider()
                tool_name = html_out.get("tool", "visualization").replace("__", " › ")
                st.caption(f"📊 Visualization from {tool_name}")
                if html_out.get("summary"):
                    summary = html_out["summary"]
                    st.info(
                        f"**Summary:** {summary.get('protein_differences', '?')} protein differences, "
                        f"{summary.get('peptide_binding_differences', '?')} in peptide binding sites"
                    )
                render_html_visualization(html_out["html"], height=700)

            # Show tool calls for assistant messages
            if msg.get("tool_calls"):
                with st.expander(f"Tool calls ({len(msg['tool_calls'])})"):
                    for tc in msg["tool_calls"]:
                        st.caption(f"**{tc.get('tool', '?')}**")
                        st.code(json.dumps(tc.get("args", {}), indent=2), language="json")

    # --- Chat input ---
    can_chat = bool(api_key) and mcp_available
    if prompt := st.chat_input(
        "Ask about the patient's results...",
        disabled=not can_chat or st.session_state.chat_processing,
    ):
        # Add user message to display immediately
        st.session_state.chat_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Set processing flag
        st.session_state.chat_processing = True

        # Generate response
        with st.chat_message("assistant"):
            thinking = st.empty()
            thinking.caption("Thinking...")

            try:
                from clients.mcp_session import MCPSession
                from clients.chat_client import format_results_for_chat, make_anthropic_chat_analyzer

                # Initialize MCP session if needed
                if st.session_state.mcp_session is None:
                    thinking.caption("Starting MCP servers...")
                    st.session_state.mcp_session = MCPSession(MCP_SERVERS_CONFIG)
                    # Use the persistent event loop instead of asyncio.run()
                    _event_loop.run_until_complete(st.session_state.mcp_session.ensure_started())

                thinking.caption("Thinking...")

                # Create analyzer and send message
                analyzer = make_anthropic_chat_analyzer(
                    api_key=api_key,
                    model=model,
                    mcp_manager=st.session_state.mcp_session.manager,
                )

                # Format patient context for first message
                patient_context = None
                if not st.session_state.chat_history:
                    patient_context = format_results_for_chat(results)

                # Track current tool for UI
                current_tool = st.empty()

                def on_tool_call(tool_name: str, args: dict):
                    parts = tool_name.split("__", 1)
                    server = parts[0].upper() if len(parts) > 1 else "?"
                    tool = parts[1] if len(parts) > 1 else tool_name
                    current_tool.caption(f"Calling {server}: {tool}...")

                result = analyzer.send_message_sync(
                    user_message=prompt,
                    conversation_history=st.session_state.chat_history,
                    system_prompt=CHAT_SYSTEM_PROMPT,
                    patient_context=patient_context,
                    on_tool_call=on_tool_call,
                )

                # Clear thinking indicators
                thinking.empty()
                current_tool.empty()

                # Display response
                st.markdown(result["response"])

                # Render any HTML visualizations from tools (e.g., IMGT comparisons)
                html_outputs = result.get("html_outputs", [])
                for html_out in html_outputs:
                    st.divider()
                    tool_name = html_out.get("tool", "visualization").replace("__", " › ")
                    st.caption(f"📊 Visualization from {tool_name}")
                    if html_out.get("summary"):
                        summary = html_out["summary"]
                        st.info(
                            f"**Summary:** {summary.get('protein_differences', '?')} protein differences, "
                            f"{summary.get('peptide_binding_differences', '?')} in peptide binding sites"
                        )
                    render_html_visualization(html_out["html"], height=700)

                # Show tool calls if any
                if result["tool_calls"]:
                    with st.expander(f"Tool calls ({len(result['tool_calls'])})"):
                        for tc in result["tool_calls"]:
                            st.caption(f"**{tc.get('tool', '?')}**")
                            st.code(json.dumps(tc.get("args", {}), indent=2), language="json")

                # Update state
                st.session_state.chat_messages.append({
                    "role": "assistant",
                    "content": result["response"],
                    "tool_calls": result["tool_calls"],
                    "html_outputs": result.get("html_outputs", []),
                })
                st.session_state.chat_history = result["updated_history"]

            except Exception as e:
                thinking.empty()
                st.error(f"Error: {e}")
                # Add error message to chat
                st.session_state.chat_messages.append({
                    "role": "assistant",
                    "content": f"I encountered an error: {e}",
                    "tool_calls": None,
                })

            finally:
                st.session_state.chat_processing = False

    # --- Control buttons ---
    col1, col2 = st.columns(2)
    with col1:
        if st.button("New Chat", use_container_width=True):
            st.session_state.chat_messages = []
            st.session_state.chat_history = []
            st.rerun()
    with col2:
        # Download chat report button
        if st.session_state.chat_messages:
            chat_report = generate_chat_report(
                chat_messages=st.session_state.chat_messages,
                patient_context=results,
            )
            mutation_str = results.get("mutation", "unknown")
            ts = datetime.now().strftime("%Y%m%d_%H%M")
            st.download_button(
                "Download Chat Report",
                data=chat_report,
                file_name=f"neocheck_chat_{mutation_str}_{ts}.html",
                mime="text/html",
                use_container_width=True,
            )
        else:
            st.button("Download Chat Report", disabled=True, use_container_width=True)




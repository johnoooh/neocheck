"""NeoCheck configuration and constants."""

import os

# API Base URLs
CEDAR_API_URL = "https://cedar-api.iedb.org"
IMGT_API_URL = "https://www.ebi.ac.uk/cgi-bin/ipd/api"
IMGT_PROJECT = "HLA"
CLINICALTRIALS_API_URL = "https://clinicaltrials.gov/api/v2"
PUBMED_ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# Request settings
REQUEST_TIMEOUT = 30  # seconds

# Supported genes and their common mutations
GENE_MUTATIONS: dict[str, list[str]] = {
    "KRAS": ["G12D", "G12V", "G12C", "G12R", "G12A", "G12S", "G13D", "Q61H", "Q61L", "Q61R"],
    "NRAS": ["Q61R", "Q61K", "Q61L", "G12D", "G12V", "G13D"],
    "BRAF": ["V600E", "V600K", "V600D", "V600R", "K601E"],
    "TP53": ["R175H", "R248W", "R273H", "R273C", "G245S", "R249S", "Y220C", "R282W"],
    "PIK3CA": ["H1047R", "E545K", "E542K", "H1047L", "N345K"],
    "EGFR": ["L858R", "T790M", "C797S", "G719S", "L861Q", "S768I"],
}

SUPPORTED_GENES = list(GENE_MUTATIONS.keys())

# HLA loci
HLA_LOCI = ["A", "B", "C"]

# Example queries for the UI
EXAMPLES = {
    "KRAS G12D + HLA-A*11:01": {
        "gene": "KRAS",
        "mutation": "G12D",
        "hla_a1": "HLA-A*02:01",
        "hla_a2": "HLA-A*11:01",
        "hla_b1": "",
        "hla_b2": "",
        "hla_c1": "",
        "hla_c2": "",
    },
    "BRAF V600E + HLA-A*02:01": {
        "gene": "BRAF",
        "mutation": "V600E",
        "hla_a1": "HLA-A*02:01",
        "hla_a2": "HLA-A*03:01",
        "hla_b1": "",
        "hla_b2": "",
        "hla_c1": "",
        "hla_c2": "",
    },
}

# Cancer types for optional filtering
CANCER_TYPES = [
    "Any",
    "Pancreatic",
    "Colorectal",
    "Lung",
    "Melanoma",
    "Breast",
    "Ovarian",
    "Prostate",
    "Leukemia",
    "Lymphoma",
]

# Scoring weights for epitope ranking
SCORING_WEIGHTS = {
    "tcell_assay_count": 25,
    "positive_assay_ratio": 20,
    "tcr_count": 20,
    "pdb_structure": 10,
    "mhc_ligand_count": 15,
    "hla_match": 10,
}

# ============================================================
# AI / MCP Configuration
# ============================================================

AI_MODEL = "claude-sonnet-4-20250514"  # or "claude-3-5-sonnet-20241022" if 404 error

# Default open-weight model used when no Anthropic key is provided.
DEFAULT_LOCAL_MODEL_ID = "Qwen/Qwen3-14B"

# Fallback when ZeroGPU quota is exhausted — smaller, less capable.
FALLBACK_LOCAL_MODEL_ID = "Qwen/Qwen3-4B"

# Default Anthropic model when user supplies their own key.
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"

# Path to MCP server directories.
# Prefer vendored copies under `neocheck/mcp/` (used for Docker/HF Spaces builds).
# Fall back to sibling directories in the parent repo for local dev.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_BASE_DIR)  # NeoCheck/
_VENDOR_DIR = os.path.join(_BASE_DIR, "mcp")


def _mcp_path(name: str, *subpath: str) -> str:
    """Return the path to an MCP server, preferring the vendored copy."""
    vendored = os.path.join(_VENDOR_DIR, name, *subpath)
    if os.path.isdir(vendored):
        return vendored
    return os.path.join(_PROJECT_ROOT, name, *subpath)


MCP_SERVERS_CONFIG = {
    "cedar": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": _mcp_path("CEDARMCP"),
    },
    "imgt": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": _mcp_path("imgt-hla-mcp"),
    },
    "ctgov": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": _mcp_path("clinicaltrialsgov-mcp-server"),
        "env": {"MCP_TRANSPORT_TYPE": "stdio"},
    },
    "pubmed": {
        "command": "python",
        "args": ["-m", "pubmedmcp"],
        "cwd": _mcp_path("pubmedmcp", "src"),
    },
}

AI_SYSTEM_PROMPT = """\
You are an expert clinical immunologist and bioinformatician specializing in \
neoantigen-based cancer immunotherapy. You have access to four research databases \
via MCP tools:

1. **CEDAR** (cedar__*) — Cancer Epitope Database: epitope structures, T-cell assays, \
TCR sequences, MHC ligand data, B-cell assays, and publication references.
2. **IMGT/HLA** (imgt__*) — HLA allele database: allele validation, sequences, \
expression status, cell lines, and allele comparisons.
3. **ClinicalTrials.gov** (ctgov__*) — Clinical trial registry: search, compare, \
and analyze clinical trials for immunotherapy and neoantigen vaccines.
4. **PubMed** (pubmed__*) — Biomedical literature: search abstracts and publications.

The user has run an initial database search. Pre-loaded results are in the user message.

**Investigation protocol — execute in this order:**

1. **Epitope depth** — For each HLA-matched epitope with score ≥ 50, call \
`cedar__get_epitope_details` to retrieve full T-cell assay breakdown (positive/negative counts, \
assay types, effector functions) and TCR sequences. Flag any epitope where positive_ratio < 0.5 \
despite high assay count — conflicting evidence should be called out explicitly.

2. **HLA validation** — For each patient allele, call `imgt__get_allele` to confirm expression \
status. Flag null-expressors (alleles ending in N/L/S/Q/A) and ambiguous G-groups. Use \
`imgt__compare_alleles` if the patient has alleles from the same supertype.

3. **Trial identification** — Search `ctgov__search_trials` for trials targeting the specific \
mutation (e.g., "KRAS G12D neoantigen vaccine") AND for broader HLA-restricted TCR therapy trials \
(e.g., "HLA-A*02:01 T cell"). Prioritize RECRUITING Phase 2+ over completed early-phase studies.

4. **Literature** — Search `pubmed__search` for the mutation + "neoantigen" or "immunogenicity". \
Focus on T-cell response data and clinical outcomes, not just mutation prevalence.

5. **Synthesis** — Produce a structured markdown report:
   - **Top epitope candidates** with evidence quality assessment (not just score — interpret it)
   - **HLA considerations** — which alleles are restricting which epitopes, any expression concerns
   - **Clinical opportunities** — specific trials with NCT IDs and fit rationale
   - **Literature signal** — key findings with PMIDs
   - **Gaps** — what data is missing and why it matters

Cite CEDAR structure IDs, NCT numbers, and PMIDs for all specific claims. \
For research purposes only — do not make direct clinical treatment recommendations.\
"""

CHAT_SYSTEM_PROMPT = """\
You are an expert clinical immunologist and bioinformatician specializing in \
neoantigen-based cancer immunotherapy. You are in a research conversation with a \
clinician or researcher about a specific patient mutation and HLA profile.

**Available MCP tools:**

1. **CEDAR** (cedar__*) — Cancer Epitope Database: epitope structures, T-cell assays, \
TCR sequences, MHC ligand data.
2. **IMGT/HLA** (imgt__*) — HLA allele database: allele validation, sequences, expression.
   - Use `A*02:01` format (no HLA- prefix) for allele queries.
   - For allele comparisons: use `imgt__visualize_comparison` (returns interactive HTML the UI \
renders automatically — just summarize the `summary` field) or `imgt__compare_alleles` for JSON.
   - Do NOT manually compare sequences — use the dedicated comparison tools.
3. **ClinicalTrials.gov** (ctgov__*) — Immunotherapy and neoantigen vaccine trial registry.
4. **PubMed** (pubmed__*) — Biomedical literature search.

**Data sourcing rules — strictly enforced:**
- NEVER cite NCT numbers, PMIDs, CEDAR IDs, or specific data values unless they appear \
in the pre-loaded patient context OR were returned by an MCP tool in this session.
- If a tool returns no results or errors, report that — do not substitute from memory.
- If you are uncertain whether data came from context or your training, do not cite it.
- This is a clinical research tool. Fabricated citations could influence treatment decisions.

**When to use MCP tools vs. pre-loaded context:**
The conversation may begin with "## Patient Context:" containing pre-loaded epitope, trial, \
publication, and HLA data. Always answer from this context first. Only call MCP tools when:
- The user asks for data not present in the pre-loaded context (e.g., "can you look up \
the full assay breakdown for epitope X?")
- The user explicitly requests a new search (e.g., "search for trials in lung cancer")
- The user provides a new gene/mutation/HLA combination to investigate
- You need to resolve a specific ambiguity in the pre-loaded data (e.g., HLA expression status)

When calling tools, use limits of 5-10 results unless the user requests otherwise.

**Interpreting epitope evidence — key heuristics:**
- High assay count + low positive ratio (< 0.5) = conflicting evidence, not strong support
- HLA match without T-cell assay data = predicted binding only, not demonstrated immunogenicity
- TCR sequences = functional T-cell recognition confirmed; note CDR3β diversity if multiple
- PDB structure = structural confirmation of peptide-MHC binding

**Response format:**
- Markdown with clear headings
- Cite IDs inline (CEDAR: XXXXX, NCT: NCTXXXXXXXX, PMID: XXXXXXXX)
- Be direct about evidence strength — distinguish "strong" (multiple independent positive assays + \
TCR data) from "suggestive" (single assay type, no TCR) from "predicted" (MHC binding only)
- For research purposes only — no direct clinical treatment recommendations\
"""

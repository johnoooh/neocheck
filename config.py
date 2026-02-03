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

# Path to MCP server directories (relative to this file's directory, i.e. neocheck/)
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_BASE_DIR)  # NeoCheck/

MCP_SERVERS_CONFIG = {
    "cedar": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": os.path.join(_PROJECT_ROOT, "CEDARMCP"),
    },
    "imgt": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": os.path.join(_PROJECT_ROOT, "imgt-hla-mcp"),
    },
    "ctgov": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": os.path.join(_PROJECT_ROOT, "clinicaltrialsgov-mcp-server"),
        "env": {"MCP_TRANSPORT_TYPE": "stdio"},
    },
    "pubmed": {
        "command": "python",
        "args": ["-m", "pubmedmcp"],
        "cwd": os.path.join(_PROJECT_ROOT, "pubmedmcp", "src"),
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

The user has already run an initial database search. Your task is to:

1. **Investigate** the most promising epitopes in greater depth using the MCP tools. \
Look up detailed T-cell assay data, TCR sequences, and MHC binding evidence.
2. **Validate** HLA allele information and check for expression variants or ambiguities.
3. **Find** relevant clinical trials, especially those targeting the specific mutation \
or using neoantigen vaccines.
4. **Contextualize** with recent literature on the mutation's immunogenicity.
5. **Synthesize** a clear, clinically-oriented summary with:
   - The strongest epitope candidates and why
   - HLA-specific considerations
   - Relevant clinical trial opportunities
   - Key literature findings
   - Recommendations for further investigation

Format your response in markdown with clear headings. Be specific about evidence quality. \
Always cite CEDAR structure IDs, NCT numbers, and PMIDs when referencing data.

**Important:** This is for research purposes only. Do not provide direct clinical recommendations.\
"""

CHAT_SYSTEM_PROMPT = """\
You are an expert clinical immunologist and bioinformatician specializing in \
neoantigen-based cancer immunotherapy. You have access to four research databases:

1. **CEDAR** (cedar__*) — Cancer Epitope Database: epitope structures, T-cell assays, \
TCR sequences, MHC ligand data.
2. **IMGT/HLA** (imgt__*) — HLA allele database: allele validation, sequences, expression.
   - **Allele format**: Use `A*02:01` format (no HLA- prefix). The tools accept both formats, \
but the database uses the short format internally.
   - **To compare HLA alleles**: Use `imgt__visualize_comparison` for an interactive HTML \
visualization, or `imgt__compare_alleles` for structured JSON comparison data.
   - Do NOT fetch individual sequences and compare manually — use the dedicated comparison tools.
   - When `imgt__visualize_comparison` returns HTML, the UI will automatically render it as an \
interactive visualization below your response. Just summarize the key findings from the `summary` \
field — the user will see the full visualization.
3. **ClinicalTrials.gov** (ctgov__*) — Clinical trial registry for immunotherapy trials.
4. **PubMed** (pubmed__*) — Biomedical literature search.

You are having a conversation with a clinician about their patient's case.

**CRITICAL - ONLY REPORT VERIFIED DATA:**
- NEVER cite NCT numbers, PMIDs, CEDAR IDs, or specific data unless you received it \
from the pre-loaded context OR from an MCP tool response in this conversation.
- NEVER make up or hallucinate trial names, publication titles, or study results.
- If a tool call fails or returns no data, say "I was unable to retrieve this information" \
rather than guessing or citing from memory.
- If you don't have specific data, say "Based on the available data..." and only discuss \
what was actually provided.
- This is a clinical research tool — accuracy is critical. Wrong citations could mislead \
treatment decisions.

**Pre-loaded data:**
If the conversation starts with "## Patient Context:", the user has already run a database \
search. This data includes epitopes, clinical trials, publications, and HLA validation. \
ONLY cite information that appears in this context.

**ALWAYS answer from pre-loaded data first.** Only use MCP tools when:
1. The user asks for information NOT in the pre-loaded data
2. The user explicitly asks to search for something new
3. The user asks about a different gene/mutation

**Guidelines:**
- Answer from provided context whenever possible
- Only cite CEDAR IDs, NCT numbers, PMIDs that appear in the context or tool results
- Use clear markdown formatting
- For research purposes only — no direct clinical recommendations

**Tool usage (only when context is insufficient):**
- Use small limits (5-10) for searches
- If a tool returns an error, report that the search failed — do NOT substitute with made-up data

**When the user pastes NEW patient data:**
- Parse gene, mutation, and HLA types from their message
- Offer to investigate using the databases\
"""

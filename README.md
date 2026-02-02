# 🧬 NeoCheck

**Neoantigen HLA Compatibility Checker** — v1.0

Analyze cancer mutations and HLA types to identify personalized immunotherapy opportunities. NeoCheck integrates four public biomedical databases to surface relevant epitopes, T-cell evidence, clinical trials, and publications for any gene–mutation–HLA combination.

---

## Overview

NeoCheck is a Streamlit web application designed for researchers investigating neoantigen-based immunotherapy. Given a cancer mutation and a patient's HLA typing, it:

- Searches for known epitopes harboring that mutation
- Identifies which epitopes are restricted to the patient's HLA alleles
- Summarizes the supporting evidence (T-cell assays, TCR sequences, MHC ligand data, crystal structures)
- Finds relevant clinical trials currently recruiting
- Retrieves recent publications from the literature

No API keys are required — all data sources are publicly accessible.

## Data Sources

| Source | What it provides | URL |
|--------|-----------------|-----|
| **CEDAR** (IEDB) | Epitope structures, T-cell assays, TCR sequences, MHC ligand assays, PDB structures | [cedar.iedb.org](https://cedar.iedb.org) |
| **IMGT/HLA** (EBI) | HLA allele validation, accession numbers, metadata, citations | [ebi.ac.uk/ipd/imgt/hla](https://www.ebi.ac.uk/ipd/imgt/hla/) |
| **ClinicalTrials.gov** | Recruiting immunotherapy and neoantigen vaccine trials | [clinicaltrials.gov](https://clinicaltrials.gov) |
| **PubMed** | Recent publications on the mutation and neoantigen context | [pubmed.ncbi.nlm.nih.gov](https://pubmed.ncbi.nlm.nih.gov) |

## Quick Start

### Prerequisites

- Python 3.10 or higher
- pip

### Install and Run

```bash
# Clone the repository
git clone <your-repo-url>
cd neocheck

# Install dependencies
pip install -r requirements.txt

# Launch the app
streamlit run app.py
```

The app will open in your browser at `http://localhost:8501`.

## Project Structure

```
neocheck/
├── app.py                          # Main Streamlit application
├── config.py                       # API URLs, gene/mutation references, constants
├── requirements.txt                # Python dependencies
├── .streamlit/
│   └── config.toml                 # Streamlit theme configuration
├── clients/                        # REST API client modules
│   ├── cedar_client.py             # CEDAR epitope database (PostgREST)
│   ├── imgt_client.py              # IMGT/HLA allele database (EBI REST)
│   ├── clinicaltrials_client.py    # ClinicalTrials.gov v2 API
│   └── pubmed_client.py            # PubMed E-utilities (ESearch + EFetch)
├── analyzers/                      # Analysis orchestration
│   ├── epitope_analyzer.py         # Epitope search, HLA matching, evidence gathering
│   ├── hla_analyzer.py             # HLA allele validation via IMGT
│   ├── trial_analyzer.py           # Clinical trial search and filtering
│   └── publication_analyzer.py     # PubMed literature search
└── utils/                          # Shared utilities
    ├── scoring.py                  # Epitope ranking and evidence summarization
    ├── validators.py               # Input validation (mutations, HLA alleles)
    └── formatters.py               # Export formatting (JSON, CSV, HTML report)
```

## Usage

1. **Enter a mutation** — Type any gene name (e.g., `KRAS`, `BRAF`, `TP53`, `EGFR`) and mutation (e.g., `G12D`, `V600E`). Common mutations are suggested for well-known oncogenes.

2. **Enter HLA alleles** — Provide at least one HLA allele. The app supports HLA-A, HLA-B, and HLA-C loci. Accepted formats include `A*02:01`, `HLA-A*02:01`, or `A*02:01:01:01`.

3. **Click "Run Analysis"** — The app queries all four databases with a progress indicator.

4. **Review results:**
   - **Summary metrics** — Epitope count, T-cell assays, clinical trials, publications
   - **Top Epitopes** — Detailed cards with evidence summaries, TCR sequences, and assay data
   - **All Epitopes** — Sortable table view with descriptive summaries
   - **Clinical Trials** — Expandable cards with status, phase, enrollment, and links
   - **Publications** — Titles, authors, abstracts, and PubMed links
   - **HLA Information** — IMGT validation status and allele metadata

5. **Export** — Download results as JSON, CSV, or a standalone HTML report.

### Quick Examples

The app includes pre-configured example buttons:
- **KRAS G12D** + HLA-A\*02:01 / HLA-A\*11:01
- **BRAF V600E** + HLA-A\*02:01 / HLA-A\*03:01

## Features (v1)

- Free-text gene and mutation input (not restricted to a preset list)
- HLA-A, HLA-B, and HLA-C allele support
- Epitope search with neoantigen filtering via CEDAR
- HLA-matched epitope identification and ranking
- Descriptive evidence summaries for each epitope
- T-cell assay and TCR sequence details for top epitopes
- HLA allele validation against IMGT/HLA
- Clinical trial search filtered by cancer type
- PubMed literature search
- Advanced options (cancer type filter, neoantigen-only toggle, result limits)
- Export to JSON, CSV, and standalone HTML report
- Aggressive caching to minimize redundant API calls
- Research disclaimer

## Coming Soon

- **Claude AI integration** — Intelligent interpretation of results using the Anthropic API, with natural-language summaries and clinical context
- **MCP server integration** — Connect to CEDAR, IMGT/HLA, ClinicalTrials.gov, and PubMed via Model Context Protocol for AI-orchestrated queries
- **Docker containerization** — One-command deployment with Docker
- **HLA Class II support** — DRB1, DQB1, and other Class II loci
- **Batch analysis** — Analyze multiple mutations in a single run
- **Interactive visualizations** — Plotly charts for epitope comparisons and evidence landscapes

## Deployment

### Streamlit Community Cloud (simplest)

1. Push your code to a GitHub repository
2. Go to [share.streamlit.io](https://share.streamlit.io)
3. Connect your repository and set the main file path to `app.py`
4. Deploy — no server configuration needed

### Docker

Create a `Dockerfile` in the project root:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8501

HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health || exit 1

ENTRYPOINT ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

Then build and run:

```bash
docker build -t neocheck .
docker run -p 8501:8501 neocheck
```

### Generic Server

For a production deployment behind a reverse proxy (e.g., nginx):

```bash
# Install dependencies in a virtual environment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run with nohup or a process manager (systemd, supervisor)
streamlit run app.py --server.port=8501 --server.address=0.0.0.0 --server.headless=true
```

Point your reverse proxy to `http://localhost:8501` and configure WebSocket support for Streamlit's live connection.

## Dependencies

| Package | Purpose |
|---------|---------|
| `streamlit` >= 1.32.0 | Web application framework |
| `pandas` >= 2.0.0 | Data manipulation and table display |
| `plotly` >= 5.18.0 | Interactive visualizations (used in future features) |
| `requests` >= 2.31.0 | HTTP client for all API calls |

## Disclaimer

This tool is for **research purposes only**. Results should not be used for clinical decision-making without professional medical review. Always consult qualified healthcare professionals for patient care decisions.

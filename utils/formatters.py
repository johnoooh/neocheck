"""Export and formatting utilities for NeoCheck results."""

import csv
import io
import json
from datetime import datetime
from typing import Any

from utils.scoring import summarize_epitope


def results_to_json(results: dict[str, Any]) -> str:
    """Export results as formatted JSON string."""
    export = {
        "neocheck_version": "1.0.0",
        "generated_at": datetime.now().isoformat(),
        **results,
    }
    return json.dumps(export, indent=2, default=str)


def results_to_csv(results: dict[str, Any]) -> str:
    """Export epitope summary as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Rank", "Sequence", "Mutation", "Summary", "HLA Matched",
        "MHC Alleles", "T-cell Assays", "TCRs", "MHC Ligands",
        "PDB IDs", "Diseases", "CEDAR URL",
    ])

    epitopes = results.get("epitopes", {}).get("epitopes", [])
    for i, ep in enumerate(epitopes, 1):
        writer.writerow([
            i,
            ep.get("linear_sequence", ""),
            ep.get("mutation", ""),
            summarize_epitope(ep),
            "Yes" if ep.get("hla_matched") else "No",
            "; ".join(ep.get("mhc_alleles") or []),
            ep.get("tcell_assay_count", 0),
            ep.get("tcr_count", 0),
            ep.get("mhc_assay_count", 0),
            "; ".join(ep.get("pdb_ids") or []),
            "; ".join(ep.get("diseases") or []),
            ep.get("cedar_url", ""),
        ])

    return output.getvalue()


def generate_html_report(results: dict[str, Any]) -> str:
    """Generate a standalone HTML report."""
    gene = results.get("gene", "")
    mutation = results.get("mutation", "")
    hla_alleles = results.get("hla_alleles", [])
    epitopes = results.get("epitopes", {}).get("epitopes", [])
    trials = results.get("trials", [])
    publications = results.get("publications", [])
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Build epitope rows
    epitope_rows = ""
    for i, ep in enumerate(epitopes[:20], 1):
        match_badge = '<span style="color:#2ca02c;font-weight:bold">HLA Match</span>' if ep.get("hla_matched") else ""
        summary = summarize_epitope(ep)
        epitope_rows += f"""
        <tr>
            <td>{i}</td>
            <td><code>{ep.get('linear_sequence', 'N/A')}</code></td>
            <td>{ep.get('mutation', '')}</td>
            <td>{summary}</td>
            <td>{'; '.join(ep.get('mhc_alleles') or ['N/A'])}</td>
            <td>{ep.get('tcell_assay_count', 0)}</td>
            <td>{ep.get('tcr_count', 0)}</td>
            <td>{match_badge}</td>
            <td><a href="{ep.get('cedar_url', '#')}">CEDAR</a></td>
        </tr>"""

    # Build trial rows
    trial_rows = ""
    for t in trials:
        trial_rows += f"""
        <tr>
            <td><a href="https://clinicaltrials.gov/study/{t.get('nct_id', '')}">{t.get('nct_id', '')}</a></td>
            <td>{t.get('title', '')}</td>
            <td>{t.get('status', '')}</td>
            <td>{t.get('phase', '')}</td>
            <td>{t.get('conditions', '')}</td>
        </tr>"""

    # Build publication rows
    pub_rows = ""
    for p in publications:
        pub_rows += f"""
        <tr>
            <td><a href="https://pubmed.ncbi.nlm.nih.gov/{p.get('pmid', '')}">{p.get('pmid', '')}</a></td>
            <td>{p.get('title', '')}</td>
            <td>{p.get('authors', '')}</td>
            <td>{p.get('journal', '')}</td>
            <td>{p.get('year', '')}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NeoCheck Report - {gene} {mutation}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', 'Helvetica Neue', sans-serif; margin: 2rem auto; max-width: 1200px; color: #1d1d1f; line-height: 1.6; }}
h1 {{ color: #1d1d1f; font-weight: 600; letter-spacing: -0.02em; }}
h2 {{ color: #1d1d1f; font-weight: 500; border-bottom: 1px solid #e8e8ed; padding-bottom: 0.5rem; margin-top: 2.5rem; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border: 1px solid #e8e8ed; padding: 10px 12px; text-align: left; font-size: 0.92rem; }}
th {{ background-color: #0071e3; color: white; font-weight: 500; }}
tr:nth-child(even) {{ background-color: #f5f5f7; }}
code {{ background: #f5f5f7; padding: 2px 8px; border-radius: 6px; font-size: 0.88rem; }}
a {{ color: #0071e3; text-decoration: none; }}
a:hover {{ text-decoration: underline; }}
.summary {{ display: flex; gap: 1.5rem; margin: 1.5rem 0; }}
.metric {{ background: #ffffff; padding: 1.25rem; border-radius: 16px; text-align: center; flex: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }}
.metric .value {{ font-size: 2rem; font-weight: 600; color: #1d1d1f; letter-spacing: -0.02em; }}
.metric .label {{ color: #86868b; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }}
.disclaimer {{ background: #fff3cd; border: 1px solid #ffc107; padding: 1rem; border-radius: 12px; margin: 1rem 0; font-size: 0.9rem; }}
</style>
</head>
<body>
<h1>NeoCheck Report</h1>
<p>Generated: {timestamp}</p>
<p><strong>Query:</strong> {gene} {mutation} | HLA: {', '.join(a for a in hla_alleles if a)}</p>

<div class="disclaimer">
<strong>Disclaimer:</strong> This report is for research purposes only and should not be used for clinical decision-making without professional medical review.
</div>

<div class="summary">
<div class="metric"><div class="value">{len(epitopes)}</div><div class="label">Epitopes Found</div></div>
<div class="metric"><div class="value">{sum(1 for e in epitopes if e.get('hla_matched'))}</div><div class="label">HLA Matched</div></div>
<div class="metric"><div class="value">{len(trials)}</div><div class="label">Clinical Trials</div></div>
<div class="metric"><div class="value">{len(publications)}</div><div class="label">Publications</div></div>
</div>

<h2>Epitope Rankings</h2>
<table>
<tr><th>#</th><th>Sequence</th><th>Mutation</th><th>Summary</th><th>MHC Alleles</th><th>T-cell Assays</th><th>TCRs</th><th>HLA Match</th><th>Link</th></tr>
{epitope_rows}
</table>

<h2>Clinical Trials</h2>
{'<table><tr><th>NCT ID</th><th>Title</th><th>Status</th><th>Phase</th><th>Conditions</th></tr>' + trial_rows + '</table>' if trials else '<p>No relevant clinical trials found.</p>'}

<h2>Publications</h2>
{'<table><tr><th>PMID</th><th>Title</th><th>Authors</th><th>Journal</th><th>Year</th></tr>' + pub_rows + '</table>' if publications else '<p>No relevant publications found.</p>'}

<hr>
<p style="color: #666; font-size: 0.9rem;">Data sources: CEDAR (cedar.iedb.org), IMGT/HLA (ebi.ac.uk/ipd/imgt/hla), ClinicalTrials.gov, PubMed</p>
</body>
</html>"""

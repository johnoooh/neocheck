"""Export and formatting utilities for NeoCheck results."""

import csv
import html as html_mod
import io
import json
from datetime import datetime
from typing import Any

from utils.scoring import summarize_epitope


def _h(value: Any) -> str:
    """Escape a value for safe HTML interpolation."""
    return html_mod.escape(str(value)) if value else ""


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
        summary = _h(summarize_epitope(ep))
        alleles_str = _h('; '.join(ep.get('mhc_alleles') or ['N/A']))
        epitope_rows += f"""
        <tr>
            <td>{i}</td>
            <td><code>{_h(ep.get('linear_sequence', 'N/A'))}</code></td>
            <td>{_h(ep.get('mutation', ''))}</td>
            <td>{summary}</td>
            <td>{alleles_str}</td>
            <td>{ep.get('tcell_assay_count', 0)}</td>
            <td>{ep.get('tcr_count', 0)}</td>
            <td>{match_badge}</td>
            <td><a href="{_h(ep.get('cedar_url', '#'))}">CEDAR</a></td>
        </tr>"""

    # Build trial rows
    trial_rows = ""
    for t in trials:
        nct_id = _h(t.get('nct_id', ''))
        trial_rows += f"""
        <tr>
            <td><a href="https://clinicaltrials.gov/study/{nct_id}">{nct_id}</a></td>
            <td>{_h(t.get('title', ''))}</td>
            <td>{_h(t.get('status', ''))}</td>
            <td>{_h(t.get('phase', ''))}</td>
            <td>{_h(t.get('conditions', ''))}</td>
        </tr>"""

    # Build publication rows
    pub_rows = ""
    for p in publications:
        pmid = _h(p.get('pmid', ''))
        pub_rows += f"""
        <tr>
            <td><a href="https://pubmed.ncbi.nlm.nih.gov/{pmid}">{pmid}</a></td>
            <td>{_h(p.get('title', ''))}</td>
            <td>{_h(p.get('authors', ''))}</td>
            <td>{_h(p.get('journal', ''))}</td>
            <td>{_h(p.get('year', ''))}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NeoCheck Report - {_h(gene)} {_h(mutation)}</title>
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
<p><strong>Query:</strong> {_h(gene)} {_h(mutation)} | HLA: {', '.join(_h(a) for a in hla_alleles if a)}</p>

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


def generate_chat_report(
    chat_messages: list[dict[str, Any]],
    patient_context: dict[str, Any] | None = None,
) -> str:
    """Generate an HTML report of the AI chat conversation.

    Args:
        chat_messages: List of chat messages with 'role' and 'content' keys.
        patient_context: Optional dict with gene, mutation, hla_alleles info.

    Returns:
        HTML string for the chat report.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Build context header
    context_html = ""
    if patient_context:
        gene = patient_context.get("gene", "")
        mutation = patient_context.get("mutation", "")
        hla_alleles = patient_context.get("hla_alleles", [])
        context_html = f"""
        <div class="context-box">
            <strong>Patient Context:</strong> {gene} {mutation} | HLA: {', '.join(hla_alleles)}
        </div>
        """

    # Build chat messages
    messages_html = ""
    for msg in chat_messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        tool_calls = msg.get("tool_calls", [])

        role_class = "user" if role == "user" else "assistant"
        role_label = "You" if role == "user" else "AI Assistant"

        # Escape HTML in content but preserve markdown-style formatting
        import html
        escaped_content = html.escape(content)
        # Convert markdown-style formatting to HTML
        escaped_content = escaped_content.replace("\n", "<br>")

        # Build tool calls section if present
        tools_html = ""
        if tool_calls:
            tools_list = ""
            for tc in tool_calls:
                tool_name = tc.get("tool", "unknown")
                tools_list += f"<li><code>{html.escape(tool_name)}</code></li>"
            tools_html = f"""
            <div class="tool-calls">
                <strong>Database queries:</strong>
                <ul>{tools_list}</ul>
            </div>
            """

        messages_html += f"""
        <div class="message {role_class}">
            <div class="role-label">{role_label}</div>
            <div class="content">{escaped_content}</div>
            {tools_html}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NeoCheck Chat Report</title>
<style>
body {{
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 2rem;
    background: #f5f5f7;
    color: #1d1d1f;
    line-height: 1.6;
}}
.container {{
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    overflow: hidden;
}}
.header {{
    background: #0071e3;
    color: white;
    padding: 1.5rem 2rem;
}}
.header h1 {{
    margin: 0 0 0.5rem 0;
    font-weight: 600;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
}}
.header .timestamp {{
    opacity: 0.85;
    font-size: 0.9rem;
}}
.context-box {{
    background: #e8f4fd;
    border-left: 4px solid #0071e3;
    padding: 1rem 1.5rem;
    margin: 0;
    font-size: 0.95rem;
}}
.messages {{
    padding: 1.5rem 2rem;
}}
.message {{
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e8e8ed;
}}
.message:last-child {{
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}}
.role-label {{
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.5rem;
}}
.message.user .role-label {{
    color: #0071e3;
}}
.message.assistant .role-label {{
    color: #34c759;
}}
.content {{
    font-size: 0.95rem;
    white-space: pre-wrap;
}}
.tool-calls {{
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: #f5f5f7;
    border-radius: 8px;
    font-size: 0.85rem;
}}
.tool-calls ul {{
    margin: 0.5rem 0 0 1.25rem;
    padding: 0;
}}
.tool-calls li {{
    margin-bottom: 0.25rem;
}}
code {{
    background: #e8e8ed;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85rem;
}}
.footer {{
    padding: 1rem 2rem;
    background: #f5f5f7;
    font-size: 0.8rem;
    color: #86868b;
    text-align: center;
}}
.disclaimer {{
    background: #fff3cd;
    border: 1px solid #ffc107;
    padding: 1rem 2rem;
    font-size: 0.85rem;
}}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>NeoCheck Chat Report</h1>
        <div class="timestamp">Generated: {timestamp}</div>
    </div>
    {context_html}
    <div class="disclaimer">
        <strong>Disclaimer:</strong> This conversation is for research purposes only and should not be used for clinical decision-making without professional medical review.
    </div>
    <div class="messages">
        {messages_html if messages_html else '<p style="color: #86868b;">No messages in this conversation.</p>'}
    </div>
    <div class="footer">
        NeoCheck &mdash; Data sources: CEDAR, IMGT/HLA, ClinicalTrials.gov, PubMed
    </div>
</div>
</body>
</html>"""

"""Tests for neocheck/utils/formatters.py."""

import json
import pytest

from utils.formatters import (
    results_to_json,
    results_to_csv,
    generate_html_report,
    generate_chat_report,
)


# --- Shared test data ---

def _make_results(**overrides):
    """Build a minimal results dict for testing."""
    base = {
        "gene": "KRAS",
        "mutation": "G12D",
        "hla_alleles": ["HLA-A*02:01", "HLA-A*11:01"],
        "epitopes": {
            "total_count": 1,
            "hla_matched_count": 1,
            "epitopes": [
                {
                    "linear_sequence": "VVGADGVGK",
                    "mutation": "G12D",
                    "mhc_alleles": ["HLA-A*11:01"],
                    "tcell_assay_count": 5,
                    "tcr_count": 2,
                    "mhc_assay_count": 1,
                    "pdb_ids": [],
                    "hla_matched": True,
                    "score": 55,
                    "cedar_url": "https://cedar.iedb.org/structure/12345",
                    "diseases": ["Pancreatic cancer"],
                }
            ],
        },
        "trials": [
            {
                "nct_id": "NCT12345678",
                "title": "KRAS G12D Neoantigen Vaccine Trial",
                "status": "Recruiting",
                "phase": "Phase 2",
                "conditions": ["Pancreatic cancer"],
            }
        ],
        "publications": [
            {
                "pmid": "12345678",
                "title": "Neoantigen-specific T cells in KRAS-mutant cancers",
                "authors": "Smith J, Doe A",
                "journal": "Nature",
                "year": "2024",
            }
        ],
    }
    base.update(overrides)
    return base


# --- results_to_json ---

def test_results_to_json_structure():
    output = results_to_json(_make_results())
    parsed = json.loads(output)
    assert parsed["neocheck_version"] == "1.0.0"
    assert "generated_at" in parsed
    assert parsed["gene"] == "KRAS"


def test_results_to_json_empty():
    output = results_to_json({})
    parsed = json.loads(output)
    assert "neocheck_version" in parsed


# --- results_to_csv ---

def test_results_to_csv_header():
    output = results_to_csv(_make_results())
    header = output.split("\n")[0]
    assert "Rank" in header
    assert "Sequence" in header


def test_results_to_csv_rows():
    output = results_to_csv(_make_results())
    lines = [l for l in output.strip().split("\n") if l]
    assert len(lines) == 2  # header + 1 data row


def test_results_to_csv_empty():
    output = results_to_csv({"epitopes": {"epitopes": []}})
    lines = [l for l in output.strip().split("\n") if l]
    assert len(lines) == 1  # header only


# --- generate_html_report (normal operation) ---

def test_generate_html_report_basic():
    html = generate_html_report(_make_results())
    assert "<!DOCTYPE html>" in html
    assert "KRAS" in html
    assert "G12D" in html
    assert "VVGADGVGK" in html
    assert "NCT12345678" in html


def test_generate_html_report_empty_trials():
    results = _make_results(trials=[])
    html = generate_html_report(results)
    assert "No relevant clinical trials found" in html


def test_generate_html_report_empty_publications():
    results = _make_results(publications=[])
    html = generate_html_report(results)
    assert "No relevant publications found" in html


# --- generate_html_report XSS tests ---
# These tests prove the XSS vulnerability exists. They are expected to FAIL
# before the fix (marked xfail) and PASS after.


def test_generate_html_report_xss_epitope_sequence():
    """Malicious sequence from API should be escaped."""
    results = _make_results()
    results["epitopes"]["epitopes"][0]["linear_sequence"] = '<script>alert("xss")</script>'
    html = generate_html_report(results)
    assert "<script>" not in html



def test_generate_html_report_xss_trial_title():
    """Malicious trial title from API should be escaped."""
    results = _make_results()
    results["trials"][0]["title"] = '<img onerror=alert(1) src=x>'
    html = generate_html_report(results)
    assert "<img onerror" not in html



def test_generate_html_report_xss_publication_title():
    """Malicious publication title from API should be escaped."""
    results = _make_results()
    results["publications"][0]["title"] = '"><script>alert(1)</script>'
    html = generate_html_report(results)
    assert "<script>" not in html



def test_generate_html_report_xss_gene_mutation():
    """Malicious gene/mutation values should be escaped."""
    results = _make_results(gene='<script>alert(1)</script>', mutation='<b>bold</b>')
    html = generate_html_report(results)
    assert "<script>" not in html


# --- generate_chat_report ---

def test_generate_chat_report_basic():
    messages = [
        {"role": "user", "content": "What epitopes match?"},
        {"role": "assistant", "content": "Here are the results..."},
    ]
    html = generate_chat_report(messages)
    assert "<!DOCTYPE html>" in html
    assert "NeoCheck Chat Report" in html
    assert "What epitopes match?" in html


def test_generate_chat_report_with_context():
    messages = [{"role": "user", "content": "Test"}]
    context = {"gene": "KRAS", "mutation": "G12D", "hla_alleles": ["HLA-A*02:01"]}
    html = generate_chat_report(messages, patient_context=context)
    assert "KRAS" in html
    assert "G12D" in html


def test_generate_chat_report_escapes_content():
    """Chat report already uses html.escape — verify it works."""
    messages = [{"role": "user", "content": '<script>alert("xss")</script>'}]
    html = generate_chat_report(messages)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_generate_chat_report_empty():
    html = generate_chat_report([])
    assert "No messages" in html

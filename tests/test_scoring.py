"""Tests for neocheck/utils/scoring.py."""

from utils.scoring import score_epitope, summarize_epitope, rank_epitopes


# --- score_epitope ---

def test_score_epitope_empty():
    assert score_epitope({}) == 0


def test_score_epitope_hla_match_only():
    assert score_epitope({}, hla_matched=True) == 10


def test_score_epitope_tcell_assays_high_count():
    ep = {"tcell_ids": list(range(10))}
    assays = [{"qualitative_measure": "Positive"}] * 8 + [{"qualitative_measure": "Negative"}] * 2
    score = score_epitope(ep, tcell_assays=assays)
    # 25 (count>=10) + 20*0.8 (ratio) = 25+16 = 41
    assert score == 41


def test_score_epitope_full_evidence():
    ep = {
        "tcell_ids": list(range(10)),
        "receptor_ids": list(range(5)),
        "pdb_ids": ["1ABC"],
        "elution_ids": list(range(5)),
    }
    assays = [{"qualitative_measure": "Positive"}] * 10
    score = score_epitope(ep, tcell_assays=assays, hla_matched=True)
    # 25 + 20 + 20 + 10 + 15 + 10 = 100
    assert score == 100


def test_score_epitope_caps_at_100():
    ep = {
        "tcell_ids": list(range(100)),
        "receptor_ids": list(range(100)),
        "pdb_ids": ["1ABC", "2DEF"],
        "elution_ids": list(range(100)),
    }
    assays = [{"qualitative_measure": "Positive"}] * 100
    score = score_epitope(ep, tcell_assays=assays, hla_matched=True)
    assert score <= 100


def test_score_epitope_partial_tcr():
    ep = {"receptor_ids": ["tcr1", "tcr2"]}
    score = score_epitope(ep)
    # TCR: 20 * (2/5) = 8
    assert score == 8


def test_score_epitope_pdb_only():
    ep = {"pdb_ids": ["1ABC"]}
    score = score_epitope(ep)
    assert score == 10


# --- summarize_epitope ---

def test_summarize_epitope_empty():
    assert summarize_epitope({}) == "Limited evidence available for this epitope."


def test_summarize_epitope_single_field():
    ep = {"tcell_assay_count": 1}
    result = summarize_epitope(ep)
    assert "1 T-cell assay" in result
    assert result.endswith(".")
    assert result[0].isupper()


def test_summarize_epitope_plural():
    ep = {"tcell_assay_count": 3}
    result = summarize_epitope(ep)
    assert "3 T-cell assays" in result


def test_summarize_epitope_full():
    ep = {
        "tcell_assay_count": 3,
        "tcr_count": 2,
        "mhc_assay_count": 1,
        "pdb_ids": ["1ABC"],
        "hla_matched": True,
        "mhc_alleles": ["HLA-A*02:01"],
        "diseases": ["Melanoma"],
    }
    result = summarize_epitope(ep)
    assert "3 T-cell assays" in result
    assert "2 known TCR sequences" in result
    assert "1 MHC ligand assay" in result
    assert "1 PDB structure" in result
    assert "matches patient HLA" in result
    assert "Melanoma" in result
    assert result.endswith(".")


# --- rank_epitopes ---

def test_rank_epitopes_ordering():
    epitopes = [
        {"mhc_allele_names": []},
        {"mhc_allele_names": [], "tcell_ids": list(range(10))},
    ]
    ranked = rank_epitopes(epitopes, ["HLA-A*02:01"])
    assert ranked[0]["score"] >= ranked[1]["score"]
    assert all("score" in ep for ep in ranked)
    assert all("hla_matched" in ep for ep in ranked)


def test_rank_epitopes_hla_matching():
    epitopes = [
        {"mhc_allele_names": ["HLA-A*02:01"]},
    ]
    ranked = rank_epitopes(epitopes, ["HLA-A*02:01"])
    assert ranked[0]["hla_matched"] is True
    assert ranked[0]["score"] >= 10  # At least the HLA match bonus


def test_rank_epitopes_no_match():
    epitopes = [
        {"mhc_allele_names": ["HLA-B*07:02"]},
    ]
    ranked = rank_epitopes(epitopes, ["HLA-A*02:01"])
    assert ranked[0]["hla_matched"] is False

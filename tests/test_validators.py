"""Tests for neocheck/utils/validators.py."""

from utils.validators import (
    parse_mutation,
    validate_mutation,
    normalize_hla_allele,
    normalize_hla_allele_full,
    validate_hla_allele,
)


# --- parse_mutation ---

def test_parse_mutation_gene_and_mutation():
    assert parse_mutation("KRAS G12D") == ("KRAS", "G12D")


def test_parse_mutation_bare():
    assert parse_mutation("G12D") == (None, "G12D")


def test_parse_mutation_p_prefix():
    assert parse_mutation("KRAS p.G12D") == ("KRAS", "G12D")


def test_parse_mutation_p_prefix_no_gene():
    assert parse_mutation("p.V600E") == (None, "V600E")


def test_parse_mutation_case_normalization():
    gene, mut = parse_mutation("kras g12d")
    assert gene == "KRAS"
    assert mut == "G12D"


def test_parse_mutation_whitespace():
    assert parse_mutation("  BRAF  V600E  ") == ("BRAF", "V600E")


# --- validate_mutation ---

def test_validate_mutation_valid():
    is_valid, msg = validate_mutation("G12D")
    assert is_valid is True
    assert msg == ""


def test_validate_mutation_v600e():
    is_valid, _ = validate_mutation("V600E")
    assert is_valid is True


def test_validate_mutation_invalid_format():
    is_valid, msg = validate_mutation("XXYZ")
    assert is_valid is False
    assert "Invalid mutation format" in msg


def test_validate_mutation_empty():
    is_valid, msg = validate_mutation("")
    assert is_valid is False
    assert "required" in msg.lower()


def test_validate_mutation_numbers_only():
    is_valid, _ = validate_mutation("123")
    assert is_valid is False


# --- normalize_hla_allele ---

def test_normalize_hla_allele_bare():
    assert normalize_hla_allele("A*02:01") == "HLA-A*02:01"


def test_normalize_hla_allele_prefixed():
    assert normalize_hla_allele("HLA-A*02:01") == "HLA-A*02:01"


def test_normalize_hla_allele_four_field():
    assert normalize_hla_allele("A*02:01:01:01") == "HLA-A*02:01"


def test_normalize_hla_allele_b_locus():
    assert normalize_hla_allele("B*07:02") == "HLA-B*07:02"


def test_normalize_hla_allele_c_locus():
    assert normalize_hla_allele("C*07:01") == "HLA-C*07:01"


def test_normalize_hla_allele_invalid_locus():
    assert normalize_hla_allele("D*01:01") is None


def test_normalize_hla_allele_garbage():
    assert normalize_hla_allele("foobar") is None


def test_normalize_hla_allele_empty():
    assert normalize_hla_allele("") is None


# --- normalize_hla_allele_full ---

def test_normalize_hla_allele_full_two_field():
    assert normalize_hla_allele_full("A*02:01") == "A*02:01"


def test_normalize_hla_allele_full_four_field():
    assert normalize_hla_allele_full("A*02:01:01:01") == "A*02:01:01:01"


def test_normalize_hla_allele_full_three_field():
    assert normalize_hla_allele_full("B*07:02:01") == "B*07:02:01"


def test_normalize_hla_allele_full_strips_prefix():
    result = normalize_hla_allele_full("HLA-A*02:01")
    assert result == "A*02:01"
    assert not result.startswith("HLA-")


def test_normalize_hla_allele_full_invalid():
    assert normalize_hla_allele_full("garbage") is None


# --- validate_hla_allele ---

def test_validate_hla_allele_valid():
    is_valid, msg = validate_hla_allele("A*02:01")
    assert is_valid is True
    assert msg == ""


def test_validate_hla_allele_invalid():
    is_valid, msg = validate_hla_allele("XYZ")
    assert is_valid is False
    assert "Invalid HLA format" in msg


def test_validate_hla_allele_empty_ok():
    is_valid, msg = validate_hla_allele("")
    assert is_valid is True
    assert msg == ""

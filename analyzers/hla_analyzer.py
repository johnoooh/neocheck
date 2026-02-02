"""HLA allele analysis using IMGT/HLA API."""

from typing import Any
from clients.imgt_client import imgt_client


def validate_and_fetch_allele(allele_name: str) -> dict[str, Any]:
    """Validate an HLA allele against IMGT and fetch details.

    Returns dict with allele info or error.
    """
    try:
        data = imgt_client.get_allele(allele_name)
        return {
            "valid": True,
            "accession": data.get("accession", ""),
            "name": data.get("name", ""),
            "locus": data.get("locus", ""),
            "class": data.get("class", ""),
            "features": _extract_features(data),
            "citations": _extract_citations(data),
            "cell_count": len(data.get("cell_entries", [])),
        }
    except ValueError as e:
        return {"valid": False, "error": str(e), "name": allele_name}
    except Exception as e:
        return {"valid": False, "error": f"IMGT API error: {str(e)}", "name": allele_name}


def fetch_all_hla_info(allele_names: list[str]) -> list[dict[str, Any]]:
    """Fetch IMGT info for all patient HLA alleles."""
    results = []
    for name in allele_names:
        if not name:
            continue
        results.append(validate_and_fetch_allele(name))
    return results


def _extract_features(data: dict[str, Any]) -> list[dict[str, str]]:
    """Extract relevant features from allele data."""
    features = []
    for section in ("coding", "genomic", "protein"):
        for f in data.get("feature", {}).get(section, []):
            features.append({
                "type": f.get("type", ""),
                "number": str(f.get("number", "")),
                "start": f.get("start", 0),
                "length": f.get("length", 0),
            })
    return features


def _extract_citations(data: dict[str, Any]) -> list[dict[str, str]]:
    """Extract citations from allele data."""
    citations = []
    for c in data.get("citations", []):
        citations.append({
            "pubmed_id": c.get("pubmed", ""),
            "title": c.get("title", ""),
            "authors": c.get("authors", ""),
            "journal": c.get("journal", ""),
            "year": str(c.get("year", "")),
        })
    return citations

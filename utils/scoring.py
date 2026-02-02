"""Epitope scoring algorithms."""

from typing import Any
from config import SCORING_WEIGHTS


def score_epitope(
    epitope: dict[str, Any],
    tcell_assays: list[dict[str, Any]] | None = None,
    tcr_data: list[dict[str, Any]] | None = None,
    mhc_ligands: list[dict[str, Any]] | None = None,
    hla_matched: bool = False,
) -> int:
    """Score an epitope on a 0-100 scale based on available evidence.

    Scoring components:
    - T-cell assay count (0-25 pts)
    - Positive assay ratio (0-20 pts)
    - TCR count (0-20 pts)
    - PDB structure availability (0-10 pts)
    - MHC ligand assay count (0-15 pts)
    - HLA match bonus (0-10 pts)
    """
    score = 0.0
    weights = SCORING_WEIGHTS

    # T-cell assay count score
    tcell_count = epitope.get("tcell_ids")
    n_tcell = len(tcell_count) if tcell_count else 0
    if tcell_assays is not None:
        n_tcell = max(n_tcell, len(tcell_assays))
    # Log scale: 1 assay = 5pts, 5 assays = 15pts, 10+ = 25pts
    if n_tcell >= 10:
        score += weights["tcell_assay_count"]
    elif n_tcell >= 5:
        score += weights["tcell_assay_count"] * 0.6
    elif n_tcell >= 1:
        score += weights["tcell_assay_count"] * 0.2 * min(n_tcell, 5)

    # Positive assay ratio
    if tcell_assays:
        positive = sum(
            1 for a in tcell_assays
            if a.get("qualitative_measure", "").startswith("Positive")
        )
        total = len(tcell_assays)
        if total > 0:
            ratio = positive / total
            score += weights["positive_assay_ratio"] * ratio

    # TCR count
    tcr_ids = epitope.get("receptor_ids") or epitope.get("tcr_receptor_group_ids")
    n_tcr = len(tcr_ids) if tcr_ids else 0
    if tcr_data is not None:
        n_tcr = max(n_tcr, len(tcr_data))
    if n_tcr >= 5:
        score += weights["tcr_count"]
    elif n_tcr >= 1:
        score += weights["tcr_count"] * (n_tcr / 5)

    # PDB structure
    pdb_ids = epitope.get("pdb_ids")
    if pdb_ids:
        score += weights["pdb_structure"]

    # MHC ligand count
    elution_ids = epitope.get("elution_ids")
    n_mhc = len(elution_ids) if elution_ids else 0
    if mhc_ligands is not None:
        n_mhc = max(n_mhc, len(mhc_ligands))
    if n_mhc >= 5:
        score += weights["mhc_ligand_count"]
    elif n_mhc >= 1:
        score += weights["mhc_ligand_count"] * (n_mhc / 5)

    # HLA match bonus
    if hla_matched:
        score += weights["hla_match"]

    return min(100, max(0, round(score)))


def summarize_epitope(epitope: dict[str, Any]) -> str:
    """Generate a short human-readable sentence describing the epitope evidence.

    Uses the pre-computed fields on the epitope dict (tcell_assay_count, tcr_count,
    pdb_ids, hla_matched, mhc_assay_count, diseases, mhc_alleles).
    """
    parts: list[str] = []

    # T-cell evidence
    tcell = epitope.get("tcell_assay_count", 0)
    if tcell > 0:
        parts.append(f"supported by {tcell} T-cell assay{'s' if tcell != 1 else ''}")

    # TCR evidence
    tcr = epitope.get("tcr_count", 0)
    if tcr > 0:
        parts.append(f"{tcr} known TCR sequence{'s' if tcr != 1 else ''}")

    # MHC ligand evidence
    mhc = epitope.get("mhc_assay_count", 0)
    if mhc > 0:
        parts.append(f"{mhc} MHC ligand assay{'s' if mhc != 1 else ''}")

    # PDB structures
    pdb = epitope.get("pdb_ids") or []
    if pdb:
        parts.append(f"{len(pdb)} PDB structure{'s' if len(pdb) != 1 else ''}")

    # HLA match
    if epitope.get("hla_matched"):
        alleles = epitope.get("mhc_alleles") or []
        if alleles:
            parts.append(f"matches patient HLA ({', '.join(alleles[:2])})")
        else:
            parts.append("matches patient HLA")

    # Disease context
    diseases = epitope.get("diseases") or []
    if diseases:
        disease_str = ", ".join(diseases[:2])
        if len(diseases) > 2:
            disease_str += f" +{len(diseases) - 2} more"
        parts.append(f"studied in {disease_str}")

    if not parts:
        return "Limited evidence available for this epitope."

    # Join into a sentence
    sentence = parts[0]
    if len(parts) == 2:
        sentence = f"{parts[0]} and {parts[1]}"
    elif len(parts) > 2:
        sentence = ", ".join(parts[:-1]) + f", and {parts[-1]}"

    return sentence[0].upper() + sentence[1:] + "."


def rank_epitopes(
    epitopes: list[dict[str, Any]],
    patient_hla_alleles: list[str],
) -> list[dict[str, Any]]:
    """Score and rank a list of epitopes.

    Adds 'score' and 'hla_matched' fields to each epitope dict.
    Returns epitopes sorted by score descending.
    """
    hla_set = set(a.upper() for a in patient_hla_alleles if a)

    for ep in epitopes:
        mhc_alleles = ep.get("mhc_allele_names") or []
        matched = bool(hla_set & set(a.upper() for a in mhc_alleles))
        ep["hla_matched"] = matched
        ep["score"] = score_epitope(ep, hla_matched=matched)

    return sorted(epitopes, key=lambda x: x["score"], reverse=True)

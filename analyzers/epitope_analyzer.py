"""Epitope analysis orchestrator using CEDAR API."""

from typing import Any
from clients.cedar_client import cedar_client
from utils.scoring import score_epitope


def search_epitopes_for_mutation(
    mutation: str,
    hla_alleles: list[str] | None = None,
    neoantigen_only: bool = True,
    limit: int = 50,
) -> dict[str, Any]:
    """Search CEDAR for epitopes matching a mutation, with optional HLA filtering.

    Returns dict with:
        - epitopes: list of enriched epitope dicts
        - total_count: total epitopes found
        - hla_matched_count: number matching patient HLA
    """
    # Step 1: Search for all epitopes with this mutation
    all_epitopes = cedar_client.search_epitopes(
        mutation=mutation,
        neoantigen_only=neoantigen_only,
        limit=limit,
    )

    # Step 2: Search with each HLA allele filter to identify matches
    hla_matched_ids: set[int] = set()
    if hla_alleles:
        for allele in hla_alleles:
            if not allele:
                continue
            try:
                matched = cedar_client.search_epitopes(
                    mutation=mutation,
                    mhc_allele=allele,
                    neoantigen_only=neoantigen_only,
                    limit=limit,
                )
                for ep in matched:
                    hla_matched_ids.add(ep["structure_id"])
            except Exception:
                continue

    # Step 3: Enrich and score each epitope
    hla_set = set(a.upper() for a in (hla_alleles or []) if a)
    enriched = []
    for ep in all_epitopes:
        hla_matched = ep["structure_id"] in hla_matched_ids
        ep_summary = _summarize_epitope(ep, hla_matched)
        ep_summary["score"] = score_epitope(ep, hla_matched=hla_matched)
        enriched.append(ep_summary)

    # Sort by score descending
    enriched.sort(key=lambda x: x["score"], reverse=True)

    return {
        "epitopes": enriched,
        "total_count": len(enriched),
        "hla_matched_count": sum(1 for e in enriched if e["hla_matched"]),
    }


def get_epitope_details(
    structure_id: int,
    mutation: str | None = None,
    mhc_allele: str | None = None,
) -> dict[str, Any]:
    """Get detailed data for a single epitope including T-cell assays and TCRs."""
    epitope = cedar_client.get_epitope(structure_id)
    if not epitope:
        return {"error": f"Epitope {structure_id} not found"}

    # Fetch T-cell assays
    tcell_assays = []
    try:
        tcell_assays = cedar_client.search_tcell_assays(
            structure_id=structure_id, limit=50
        )
    except Exception:
        pass

    # Fetch TCR data
    tcr_data = []
    try:
        tcr_data = cedar_client.search_tcr(
            structure_id=structure_id, limit=25
        )
    except Exception:
        pass

    # Fetch MHC ligand data
    mhc_ligands = []
    try:
        mhc_ligands = cedar_client.search_mhc_ligands(
            structure_id=structure_id, limit=25
        )
    except Exception:
        pass

    return {
        "epitope": _summarize_epitope(epitope, hla_matched=False),
        "tcell_assays": [_summarize_tcell(a) for a in tcell_assays],
        "tcr_data": [_summarize_tcr(t) for t in tcr_data],
        "mhc_ligands": [_summarize_mhc(m) for m in mhc_ligands],
        "score": score_epitope(epitope, tcell_assays, tcr_data, mhc_ligands),
    }


def _summarize_epitope(ep: dict[str, Any], hla_matched: bool) -> dict[str, Any]:
    """Create a clean summary dict from raw CEDAR epitope record."""
    return {
        "structure_id": ep.get("structure_id"),
        "linear_sequence": ep.get("linear_sequence"),
        "mutation": ep.get("mutation"),
        "structure_type": ep.get("structure_type"),
        "source_molecules": ep.get("r_object_source_molecule_names"),
        "source_organisms": ep.get("source_organism_names"),
        "mhc_alleles": ep.get("mhc_allele_names"),
        "mhc_classes": ep.get("mhc_classes"),
        "diseases": ep.get("disease_names"),
        "is_neoantigen": ep.get("neoantigen_bool") == 1,
        "tcell_assay_count": len(ep.get("tcell_ids") or []),
        "mhc_assay_count": len(ep.get("elution_ids") or []),
        "bcell_assay_count": len(ep.get("bcell_ids") or []),
        "reference_count": len(ep.get("reference_ids") or []),
        "tcr_count": len(ep.get("tcr_receptor_group_ids") or []),
        "pdb_ids": ep.get("pdb_ids"),
        "hla_matched": hla_matched,
        "cedar_url": f"https://cedar.iedb.org/epitope/{ep.get('structure_id')}",
        "score": 0,
    }


def _summarize_tcell(assay: dict[str, Any]) -> dict[str, Any]:
    return {
        "tcell_id": assay.get("tcell_id"),
        "sequence": assay.get("linear_sequence"),
        "assay_type": assay.get("assay_names"),
        "qualitative_measure": assay.get("qualitative_measure"),
        "mhc_allele": assay.get("mhc_allele_name"),
        "mhc_class": assay.get("mhc_class"),
        "mhc_evidence": assay.get("mhc_allele_evidence"),
        "host_organism": assay.get("host_organism_name"),
        "diseases": assay.get("disease_names"),
        "pubmed_id": assay.get("pubmed_id"),
        "cdr3_alpha": assay.get("receptor_chain1_cdr3_seqs"),
        "cdr3_beta": assay.get("receptor_chain2_cdr3_seqs"),
    }


def _summarize_tcr(tcr: dict[str, Any]) -> dict[str, Any]:
    return {
        "receptor_group_id": tcr.get("receptor_group_id"),
        "receptor_type": tcr.get("receptor_type"),
        "receptor_names": tcr.get("receptor_names"),
        "chain1_cdr3": tcr.get("chain1_cdr3_seq"),
        "chain2_cdr3": tcr.get("chain2_cdr3_seq"),
        "epitope_sequences": tcr.get("linear_sequences"),
        "mhc_alleles": tcr.get("mhc_allele_names"),
        "pdb_ids": tcr.get("pdb_ids"),
    }


def _summarize_mhc(mhc: dict[str, Any]) -> dict[str, Any]:
    return {
        "elution_id": mhc.get("elution_id"),
        "sequence": mhc.get("linear_sequence"),
        "assay_type": mhc.get("assay_names"),
        "qualitative_measure": mhc.get("qualitative_measure"),
        "mhc_allele": mhc.get("mhc_allele_name"),
    }

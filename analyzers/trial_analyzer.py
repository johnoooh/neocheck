"""Clinical trials analysis using ClinicalTrials.gov API."""

from typing import Any
from clients.clinicaltrials_client import clinicaltrials_client


def search_relevant_trials(
    gene: str,
    mutation: str,
    cancer_type: str | None = None,
    max_results: int = 10,
) -> list[dict[str, Any]]:
    """Search for clinical trials related to a mutation.

    Builds a query combining the gene/mutation with immunotherapy-related terms.
    """
    # Build search query
    terms = [f"{gene} {mutation}"]
    therapy_terms = "immunotherapy OR neoantigen OR vaccine OR adoptive cell OR TCR OR checkpoint"
    query = f"({' '.join(terms)}) AND ({therapy_terms})"

    if cancer_type and cancer_type != "Any":
        query += f" AND {cancer_type}"

    try:
        result = clinicaltrials_client.search_studies(query=query, page_size=max_results)
    except Exception:
        # Fallback to broader search
        try:
            query = f"{gene} {mutation} neoantigen"
            result = clinicaltrials_client.search_studies(query=query, page_size=max_results)
        except Exception:
            return []

    studies = result.get("studies", [])
    return [_parse_study(s) for s in studies]


def _parse_study(study: dict[str, Any]) -> dict[str, Any]:
    """Parse a ClinicalTrials.gov study into a clean summary dict."""
    protocol = study.get("protocolSection", {})
    ident = protocol.get("identificationModule", {})
    status = protocol.get("statusModule", {})
    design = protocol.get("designModule", {})
    conditions = protocol.get("conditionsModule", {})
    sponsor = protocol.get("sponsorCollaboratorsModule", {})
    description = protocol.get("descriptionModule", {})

    # Get enrollment
    enrollment_info = design.get("enrollmentInfo", {})
    enrollment = enrollment_info.get("count", "N/A")

    # Get phases
    phases = design.get("phases", [])
    phase = ", ".join(phases) if phases else "N/A"

    # Get sponsor name
    lead_sponsor = sponsor.get("leadSponsor", {})
    sponsor_name = lead_sponsor.get("name", "N/A")

    # Get conditions
    condition_list = conditions.get("conditions", [])

    return {
        "nct_id": ident.get("nctId", ""),
        "title": ident.get("briefTitle", "No title"),
        "status": status.get("overallStatus", "Unknown"),
        "phase": phase,
        "conditions": ", ".join(condition_list) if condition_list else "N/A",
        "enrollment": enrollment,
        "sponsor": sponsor_name,
        "brief_summary": description.get("briefSummary", ""),
    }

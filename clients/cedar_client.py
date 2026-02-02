"""CEDAR REST API client.

Mirrors the PostgREST query patterns from CEDARMCP/src/api/cedar-client.ts.
Base URL: https://cedar-api.iedb.org
"""

from typing import Any
import requests
from config import CEDAR_API_URL, REQUEST_TIMEOUT


class CEDARClient:
    def __init__(self, base_url: str = CEDAR_API_URL):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def _get(self, endpoint: str, params: dict[str, str | int] | None = None) -> list[dict[str, Any]]:
        url = f"{self.base_url}/{endpoint}"
        resp = self.session.get(url, params=params or {}, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def search_epitopes(
        self,
        mutation: str | None = None,
        mhc_allele: str | None = None,
        linear_sequence: str | None = None,
        neoantigen_only: bool = False,
        mhc_class: str | None = None,
        source_organism: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Search epitopes in CEDAR."""
        params: dict[str, str | int] = {
            "limit": limit,
            "order": "structure_id",
        }
        if mutation:
            params["mutation"] = f"eq.{mutation}"
        if mhc_allele:
            params["mhc_allele_names"] = f"cs.{{{mhc_allele}}}"
        if linear_sequence:
            seq = linear_sequence.upper()
            if "*" in seq:
                params["linear_sequence"] = f"like.{seq}"
            else:
                params["linear_sequence"] = f"eq.{seq}"
        if neoantigen_only:
            params["neoantigen_bool"] = "eq.1"
        if mhc_class:
            params["mhc_classes"] = f"cs.{{{mhc_class}}}"
        if source_organism:
            params["source_organism_names"] = f"cs.{{{source_organism}}}"
        return self._get("epitope_search", params)

    def get_epitope(self, structure_id: int) -> dict[str, Any] | None:
        """Get a single epitope by structure_id."""
        results = self._get("epitope_search", {
            "structure_id": f"eq.{structure_id}",
            "limit": 1,
        })
        return results[0] if results else None

    def search_tcell_assays(
        self,
        structure_id: int | None = None,
        mutation: str | None = None,
        mhc_allele: str | None = None,
        assay_type: str | None = None,
        qualitative_measure: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Search T-cell assay results."""
        params: dict[str, str | int] = {
            "limit": limit,
            "order": "tcell_id",
        }
        if structure_id is not None:
            params["structure_id"] = f"eq.{structure_id}"
        if mutation:
            params["mutation"] = f"eq.{mutation}"
        if mhc_allele:
            params["mhc_allele_name"] = f"eq.{mhc_allele}"
        if assay_type:
            params["assay_names"] = f"like.*{assay_type}*"
        if qualitative_measure:
            params["qualitative_measure"] = f"eq.{qualitative_measure}"
        return self._get("tcell_search", params)

    def search_tcr(
        self,
        mutation: str | None = None,
        mhc_allele: str | None = None,
        structure_id: int | None = None,
        neoantigen_only: bool = False,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Search T-cell receptors."""
        params: dict[str, str | int] = {
            "limit": limit,
            "order": "receptor_group_id",
        }
        if mutation:
            params["mutations"] = f"cs.{{{mutation}}}"
        if mhc_allele:
            params["mhc_allele_names"] = f"cs.{{{mhc_allele}}}"
        if structure_id is not None:
            params["structure_ids"] = f"cs.{{{structure_id}}}"
        if neoantigen_only:
            params["neoantigen_bool"] = "eq.1"
        return self._get("tcr_search", params)

    def search_mhc_ligands(
        self,
        structure_id: int | None = None,
        mhc_allele: str | None = None,
        mutation: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Search MHC ligand/elution assays."""
        params: dict[str, str | int] = {
            "limit": limit,
            "order": "elution_id",
        }
        if structure_id is not None:
            params["structure_id"] = f"eq.{structure_id}"
        if mhc_allele:
            params["mhc_allele_name"] = f"eq.{mhc_allele}"
        if mutation:
            params["mutation"] = f"eq.{mutation}"
        return self._get("mhc_search", params)


cedar_client = CEDARClient()

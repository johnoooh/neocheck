"""IMGT/HLA REST API client.

Mirrors the query patterns from imgt-hla-mcp/src/api/imgt-client.ts.
Base URL: https://www.ebi.ac.uk/cgi-bin/ipd/api
"""

from typing import Any
import requests
from config import IMGT_API_URL, IMGT_PROJECT, REQUEST_TIMEOUT


class IMGTClient:
    def __init__(self, base_url: str = IMGT_API_URL, project: str = IMGT_PROJECT):
        self.base_url = base_url
        self.project = project
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def _get(self, endpoint: str, params: dict[str, str | int] | None = None) -> Any:
        url = f"{self.base_url}{endpoint}"
        all_params = {"project": self.project}
        if params:
            all_params.update(params)
        resp = self.session.get(url, params=all_params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def search_alleles(
        self,
        query: str | None = None,
        locus: str | None = None,
        search_type: str = "startsWith",
        limit: int = 20,
    ) -> dict[str, Any]:
        """Search for HLA alleles by name pattern.

        Returns dict with 'data' (list of alleles) and 'meta' (pagination info).
        """
        conditions = []
        if query:
            if search_type == "exact":
                conditions.append(f'eq(name,"{query}")')
            elif search_type == "contains":
                conditions.append(f'contains(name,"{query}")')
            else:
                conditions.append(f'startsWith(name,"{query}")')
        if locus:
            conditions.append(f'startsWith(name,"{locus}*")')

        params: dict[str, str | int] = {"limit": limit}
        if conditions:
            if len(conditions) == 1:
                params["query"] = conditions[0]
            else:
                params["query"] = f"and({','.join(conditions)})"

        return self._get("/allele", params)

    def get_allele(self, allele_name: str) -> dict[str, Any]:
        """Get detailed information about a specific allele.

        First searches by name to get accession, then fetches full details.
        """
        # Search for the allele to get its accession
        search_result = self.search_alleles(query=allele_name, search_type="exact", limit=1)
        data = search_result.get("data", [])
        if not data:
            # Try startsWith for partial matches
            search_result = self.search_alleles(query=allele_name, search_type="startsWith", limit=1)
            data = search_result.get("data", [])
        if not data:
            raise ValueError(f"Allele not found: {allele_name}")

        accession = data[0]["accession"]
        return self._get(f"/allele/{accession}")

    def check_allele_exists(self, allele_name: str) -> bool:
        """Check if an allele exists in IMGT database."""
        try:
            search_result = self.search_alleles(query=allele_name, search_type="startsWith", limit=1)
            return bool(search_result.get("data"))
        except Exception:
            return False


imgt_client = IMGTClient()

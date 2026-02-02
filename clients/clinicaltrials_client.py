"""ClinicalTrials.gov v2 API client."""

from typing import Any
import requests
from config import CLINICALTRIALS_API_URL, REQUEST_TIMEOUT


class ClinicalTrialsClient:
    def __init__(self, base_url: str = CLINICALTRIALS_API_URL):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def search_studies(
        self,
        query: str,
        page_size: int = 10,
        fields: list[str] | None = None,
    ) -> dict[str, Any]:
        """Search for clinical trials.

        Returns dict with 'studies' list and 'totalCount'.
        """
        params: dict[str, str | int] = {
            "query.term": query,
            "pageSize": page_size,
        }
        if fields:
            params["fields"] = ",".join(fields)

        url = f"{self.base_url}/studies"
        resp = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_study(self, nct_id: str) -> dict[str, Any]:
        """Get a single study by NCT ID."""
        url = f"{self.base_url}/studies/{nct_id}"
        resp = self.session.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()


clinicaltrials_client = ClinicalTrialsClient()

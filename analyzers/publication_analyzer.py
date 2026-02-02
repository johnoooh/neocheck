"""Publication analysis using PubMed E-utilities."""

from typing import Any
from clients.pubmed_client import pubmed_client


def search_publications(
    gene: str,
    mutation: str,
    max_results: int = 10,
) -> list[dict[str, Any]]:
    """Search PubMed for publications related to a gene mutation and immunotherapy."""
    query = f'("{gene}" AND "{mutation}") AND (neoantigen OR epitope OR HLA OR immunotherapy)'

    try:
        articles = pubmed_client.search_articles(term=query, max_results=max_results)
    except Exception:
        # Fallback to simpler query
        try:
            query = f"{gene} {mutation} neoantigen"
            articles = pubmed_client.search_articles(term=query, max_results=max_results)
        except Exception:
            return []

    return articles

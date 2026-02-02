"""PubMed E-utilities client."""

from typing import Any
import xml.etree.ElementTree as ET
import requests
from config import PUBMED_ESEARCH_URL, PUBMED_EFETCH_URL, REQUEST_TIMEOUT


class PubMedClient:
    def __init__(self):
        self.session = requests.Session()

    def search_ids(self, term: str, max_results: int = 10) -> list[str]:
        """Search PubMed and return list of PMIDs."""
        params = {
            "db": "pubmed",
            "term": term,
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        }
        resp = self.session.get(PUBMED_ESEARCH_URL, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return data.get("esearchresult", {}).get("idlist", [])

    def fetch_articles(self, pmids: list[str]) -> list[dict[str, Any]]:
        """Fetch article details for given PMIDs. Returns structured article data."""
        if not pmids:
            return []

        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        resp = self.session.get(PUBMED_EFETCH_URL, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()

        return self._parse_xml(resp.text)

    def _parse_xml(self, xml_text: str) -> list[dict[str, Any]]:
        """Parse PubMed XML response into structured article data."""
        articles = []
        root = ET.fromstring(xml_text)

        for article_elem in root.findall(".//PubmedArticle"):
            medline = article_elem.find("MedlineCitation")
            if medline is None:
                continue

            pmid_elem = medline.find("PMID")
            pmid = pmid_elem.text if pmid_elem is not None else ""

            article = medline.find("Article")
            if article is None:
                continue

            title_elem = article.find("ArticleTitle")
            title = self._get_text(title_elem)

            # Abstract
            abstract_elem = article.find("Abstract")
            abstract = ""
            if abstract_elem is not None:
                abstract_parts = []
                for abs_text in abstract_elem.findall("AbstractText"):
                    label = abs_text.get("Label", "")
                    text = self._get_text(abs_text)
                    if label:
                        abstract_parts.append(f"{label}: {text}")
                    else:
                        abstract_parts.append(text)
                abstract = "\n".join(abstract_parts)

            # Authors
            author_list = article.find("AuthorList")
            authors = []
            if author_list is not None:
                for author in author_list.findall("Author"):
                    last = author.find("LastName")
                    initials = author.find("Initials")
                    if last is not None:
                        name = last.text or ""
                        if initials is not None and initials.text:
                            name += f" {initials.text}"
                        authors.append(name)

            # Journal
            journal_elem = article.find("Journal")
            journal = ""
            year = ""
            if journal_elem is not None:
                journal_title = journal_elem.find("Title")
                if journal_title is not None:
                    journal = journal_title.text or ""
                pub_date = journal_elem.find("JournalIssue/PubDate")
                if pub_date is not None:
                    year_elem = pub_date.find("Year")
                    if year_elem is not None:
                        year = year_elem.text or ""

            # DOI
            doi = ""
            article_id_list = article_elem.find("PubmedData/ArticleIdList")
            if article_id_list is not None:
                for aid in article_id_list.findall("ArticleId"):
                    if aid.get("IdType") == "doi":
                        doi = aid.text or ""

            articles.append({
                "pmid": pmid,
                "title": title,
                "abstract": abstract,
                "authors": ", ".join(authors[:5]) + ("..." if len(authors) > 5 else ""),
                "journal": journal,
                "year": year,
                "doi": doi,
            })

        return articles

    def _get_text(self, elem: ET.Element | None) -> str:
        """Extract all text content from an element, including mixed content."""
        if elem is None:
            return ""
        return "".join(elem.itertext()).strip()

    def search_articles(self, term: str, max_results: int = 10) -> list[dict[str, Any]]:
        """Search and fetch articles in one call."""
        pmids = self.search_ids(term, max_results)
        return self.fetch_articles(pmids)


pubmed_client = PubMedClient()

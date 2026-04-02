"""Remote and local literature providers."""

from __future__ import annotations

import json
import re
import time
import uuid
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from .retrieval import build_literature_index, search_literature
from .schema import normalize_text, tokenize, unique


def clean_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<!\[CDATA\[([\s\S]*?)\]\]>", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _build_timeout(options: dict[str, Any]) -> float:
    return float(options.get("timeoutMs", 15000)) / 1000.0


def fetch_json(url: str, options: dict[str, Any] | None = None) -> Any:
    options = options or {}
    request = Request(url, headers={"Accept": "application/json", **options.get("headers", {})})
    with urlopen(request, timeout=_build_timeout(options)) as response:
        if getattr(response, "status", 200) >= 400:
            raise RuntimeError(f"Request failed with {response.status} for {url}")
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str, options: dict[str, Any] | None = None) -> str:
    options = options or {}
    request = Request(url, headers={"Accept": options.get("accept", "text/plain"), **options.get("headers", {})})
    with urlopen(request, timeout=_build_timeout(options)) as response:
        if getattr(response, "status", 200) >= 400:
            raise RuntimeError(f"Request failed with {response.status} for {url}")
        return response.read().decode("utf-8", errors="replace")


def _as_array(value: Any) -> list[Any]:
    return value if isinstance(value, list) else [value] if value else []


def _first_value(value: Any) -> Any:
    return value[0] if isinstance(value, list) and value else value


def _extract_year(value: Any) -> int | None:
    if isinstance(value, dict) and value.get("date-parts", [[None]])[0][0]:
        return int(value["date-parts"][0][0])
    match = re.search(r"\b(19|20)\d{2}\b", str(value or ""))
    return int(match.group(0)) if match else None


def _split_authors(value: Any, pattern: str = r";|,") -> list[str]:
    return [author.strip() for author in re.split(pattern, str(value or "")) if author.strip()]


def _url_with_params(base: str, params: dict[str, Any]) -> str:
    filtered = {key: value for key, value in params.items() if value not in (None, "", [])}
    return f"{base}?{urlencode(filtered, doseq=True)}"


_last_arxiv_request_at = 0.0


def _build_arxiv_search_query(query: str, options: dict[str, Any]) -> str:
    if options.get("rawSearchQuery"):
        return options["rawSearchQuery"]
    trimmed = str(query or "").strip()
    if not trimmed:
        return "all:*"
    phrase = f'all:"{trimmed}"' if " " in trimmed else f"all:{trimmed}"
    if not options.get("categories"):
        return phrase
    category_clause = " OR ".join(f"cat:{category}" for category in options["categories"])
    return f"({phrase}) AND ({category_clause})"


def _build_arxiv_url(query: str, options: dict[str, Any]) -> str:
    return _url_with_params(
        "https://export.arxiv.org/api/query",
        {
            "search_query": _build_arxiv_search_query(query, options),
            "start": options.get("start", 0),
            "max_results": options.get("limit", 10),
            "sortBy": options.get("sortBy", "relevance"),
            "sortOrder": options.get("sortOrder", "descending"),
        },
    )


def _extract_first(xml: str, pattern: str) -> str:
    match = re.search(pattern, xml, flags=re.I | re.S)
    return clean_text(match.group(1)) if match else ""


def _extract_all(xml: str, pattern: str) -> list[str]:
    return [clean_text(match.group(1)) for match in re.finditer(pattern, xml, flags=re.I | re.S) if clean_text(match.group(1))]


def _extract_categories(xml: str) -> list[str]:
    return [clean_text(match.group(1)) for match in re.finditer(r'<category\b[^>]*term="([^"]+)"[^>]*\/?>', xml, flags=re.I) if clean_text(match.group(1))]


def _extract_pdf_url(xml: str) -> str | None:
    match = re.search(r'<link\b[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*\/?>', xml, flags=re.I)
    return clean_text(match.group(1)) if match else None


def parse_arxiv_feed(xml: str) -> list[dict[str, Any]]:
    entries = [f"<entry>{chunk.split('</entry>', 1)[0]}</entry>" for chunk in re.split(r"<entry>", xml, flags=re.I)[1:]]
    papers = []
    for entry in entries:
        paper_id = _extract_first(entry, r"<id>([\s\S]*?)</id>")
        published = _extract_first(entry, r"<published>([\s\S]*?)</published>")
        categories = _extract_categories(entry)
        primary_category = _extract_first(entry, r'<arxiv:primary_category[^>]*term="([^"]+)"')
        papers.append(
            {
                "id": paper_id,
                "title": _extract_first(entry, r"<title>([\s\S]*?)</title>"),
                "abstract": _extract_first(entry, r"<summary>([\s\S]*?)</summary>"),
                "authors": _extract_all(entry, r"<author>[\s\S]*?<name>([\s\S]*?)</name>[\s\S]*?</author>"),
                "year": int(published[:4]) if published else None,
                "venue": _extract_first(entry, r"<arxiv:journal_ref[^>]*>([\s\S]*?)</arxiv:journal_ref>") or "arXiv",
                "keywords": categories,
                "source": "arxiv",
                "provider": "arxiv",
                "providerScore": 0,
                "citationCount": 0,
                "externalIds": {
                    "doi": _extract_first(entry, r"<arxiv:doi[^>]*>([\s\S]*?)</arxiv:doi>") or None,
                    "arxiv": paper_id,
                },
                "links": {"landingPage": paper_id or None, "pdf": _extract_pdf_url(entry)},
                "categories": [item for item in [primary_category, *categories] if item],
                "published": published,
                "updated": _extract_first(entry, r"<updated>([\s\S]*?)</updated>"),
            }
        )
    return papers


def search_arxiv(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    global _last_arxiv_request_at
    options = options or {}
    min_interval_ms = int(options.get("minIntervalMs", 3000))
    elapsed = (time.time() * 1000) - _last_arxiv_request_at
    if elapsed < min_interval_ms:
        time.sleep((min_interval_ms - elapsed) / 1000.0)
    email = options.get("email") or "contact@example.com"
    xml = fetch_text(
        _build_arxiv_url(query, options),
        {
            "headers": {
                "Accept": "application/atom+xml",
                "User-Agent": options.get("userAgent") or f"research-idea-explorer/0.2 ({email})",
            },
            "accept": "application/atom+xml",
            "timeoutMs": options.get("timeoutMs"),
        },
    )
    _last_arxiv_request_at = time.time() * 1000
    return parse_arxiv_feed(xml)


def normalize_crossref_item(item: dict[str, Any]) -> dict[str, Any]:
    authors = []
    for author in item.get("author", []):
        name = " ".join(part for part in [author.get("given"), author.get("family")] if part).strip() or author.get("name")
        if name:
            authors.append(name)
    links = item.get("link", [])
    pdf_link = next((link.get("URL") for link in links if "pdf" in str(link.get("content-type", ""))), None)
    if not pdf_link:
        pdf_link = next((link.get("URL") for link in links if link.get("URL")), None)
    return {
        "id": item.get("DOI") or item.get("URL"),
        "title": clean_text(_first_value(item.get("title")) or item.get("URL")),
        "abstract": clean_text(item.get("abstract") or ""),
        "authors": authors,
        "year": _extract_year(item.get("issued") or item.get("published") or item.get("created")),
        "venue": clean_text(_first_value(item.get("container-title")) or ""),
        "keywords": [clean_text(subject) for subject in item.get("subject", []) if clean_text(subject)],
        "source": "crossref",
        "provider": "crossref",
        "providerScore": item.get("score", 0),
        "citationCount": item.get("is-referenced-by-count", 0),
        "externalIds": {"doi": item.get("DOI"), "crossref": item.get("URL")},
        "links": {"landingPage": item.get("URL"), "pdf": pdf_link},
        "categories": [item.get("type")] if item.get("type") else [],
    }


def search_crossref(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    url = _url_with_params(
        "https://api.crossref.org/works",
        {
            "query.bibliographic": query,
            "rows": options.get("limit", 10),
            "mailto": options.get("mailto"),
            "filter": options.get("filter"),
            "select": options.get("select"),
        },
    )
    data = fetch_json(url, {"headers": {"User-Agent": options.get("userAgent")} if options.get("userAgent") else {}, "timeoutMs": options.get("timeoutMs")})
    return [normalize_crossref_item(item) for item in data.get("message", {}).get("items", [])]


def normalize_openalex_work(work: dict[str, Any]) -> dict[str, Any]:
    positions = []
    for token, offsets in (work.get("abstract_inverted_index") or {}).items():
        for offset in offsets:
            positions.append((offset, token))
    abstract = " ".join(token for _, token in sorted(positions))
    keywords = [keyword.get("display_name") for keyword in work.get("keywords", []) if keyword.get("display_name")]
    keywords += [topic.get("display_name") for topic in work.get("topics", []) if topic.get("display_name")]
    return {
        "id": work.get("id"),
        "title": work.get("display_name") or work.get("title") or "",
        "abstract": abstract,
        "authors": [authorship.get("author", {}).get("display_name") for authorship in work.get("authorships", []) if authorship.get("author", {}).get("display_name")],
        "year": work.get("publication_year"),
        "venue": work.get("primary_location", {}).get("source", {}).get("display_name") or "",
        "keywords": keywords,
        "source": "openalex",
        "provider": "openalex",
        "providerScore": work.get("relevance_score", 0) or 0,
        "citationCount": work.get("cited_by_count", 0),
        "externalIds": {"doi": work.get("doi"), "openalex": work.get("id")},
        "links": {"landingPage": work.get("id"), "pdf": work.get("best_oa_location", {}).get("pdf_url") or work.get("primary_location", {}).get("pdf_url")},
        "categories": [topic.get("id") for topic in work.get("topics", []) if topic.get("id")],
    }


def search_openalex(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    url = _url_with_params(
        "https://api.openalex.org/works",
        {
            "search": query,
            "per_page": options.get("limit", 10),
            "sort": options.get("sort", "relevance_score:desc"),
            "select": ",".join(
                [
                    "id",
                    "display_name",
                    "abstract_inverted_index",
                    "publication_year",
                    "publication_date",
                    "authorships",
                    "primary_location",
                    "best_oa_location",
                    "doi",
                    "relevance_score",
                    "cited_by_count",
                    "keywords",
                    "topics",
                ]
            ),
            "api_key": options.get("apiKey"),
            "filter": options.get("filter"),
        },
    )
    data = fetch_json(url, {"headers": {"User-Agent": options.get("userAgent")} if options.get("userAgent") else {}, "timeoutMs": options.get("timeoutMs")})
    return [normalize_openalex_work(work) for work in data.get("results", [])]


def normalize_europe_pmc_result(result: dict[str, Any]) -> dict[str, Any]:
    doi = result.get("doi")
    source = result.get("source") or "EUROPEPMC"
    item_id = result.get("id") or result.get("pmid") or doi or result.get("pmcid")
    keywords = []
    keyword_list = result.get("keywordList")
    if isinstance(keyword_list, dict):
        raw_keywords = keyword_list.get("keyword", [])
        raw_keywords = raw_keywords if isinstance(raw_keywords, list) else [raw_keywords]
        keywords = [str(keyword).strip() for keyword in raw_keywords if str(keyword).strip()]
    links = result.get("fullTextUrlList", {}).get("fullTextUrl", [])
    links = links if isinstance(links, list) else [links]
    pdf = next((link.get("url") for link in links if "pdf" in str(link.get("documentStyle", "")).lower()), None)
    return {
        "id": f"{source}:{item_id}",
        "title": str(result.get("title") or "").strip(),
        "abstract": str(result.get("abstractText") or "").strip(),
        "authors": _split_authors(result.get("authorString"), r",|;"),
        "year": int(result["pubYear"]) if result.get("pubYear") else None,
        "venue": str(result.get("journalTitle") or result.get("bookOrReportDetails", {}).get("publisher") or "").strip(),
        "keywords": keywords,
        "source": "europepmc",
        "provider": "europepmc",
        "providerScore": 0,
        "citationCount": int(result.get("citedByCount", 0) or 0),
        "externalIds": {"doi": doi, "europepmc": item_id, "pmid": result.get("pmid"), "pmcid": result.get("pmcid")},
        "links": {"landingPage": f"https://europepmc.org/article/{source}/{item_id}" if item_id else None, "pdf": pdf},
        "categories": [item for item in [source, result.get("pubType")] if item],
    }


def search_europe_pmc(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    url = _url_with_params(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        {
            "query": query,
            "format": "json",
            "pageSize": options.get("limit", 10),
            "resultType": options.get("resultType", "core"),
            "sort": options.get("sort"),
            "email": options.get("email"),
        },
    )
    data = fetch_json(url, {"headers": {"User-Agent": options.get("userAgent")} if options.get("userAgent") else {}, "timeoutMs": options.get("timeoutMs")})
    return [normalize_europe_pmc_result(result) for result in data.get("resultList", {}).get("result", [])]


def _normalize_biorxiv_item(item: dict[str, Any], server: str) -> dict[str, Any]:
    return {
        "id": item.get("doi") or f"{server}:{item.get('title')}",
        "title": str(item.get("title") or "").strip(),
        "abstract": str(item.get("abstract") or "").strip(),
        "authors": _split_authors(item.get("authors"), r";|,"),
        "year": int(str(item.get("date"))[:4]) if item.get("date") else None,
        "venue": server,
        "keywords": [item.get("category"), item.get("type"), item.get("license")],
        "source": server,
        "provider": server,
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": item.get("doi"), "preprint": item.get("doi")},
        "links": {
            "landingPage": f"https://doi.org/{item['doi']}" if item.get("doi") else None,
            "pdf": f"https://www.biorxiv.org{item['jatsxml']}" if item.get("jatsxml") else None,
        },
        "categories": [item for item in [item.get("category"), item.get("type"), server] if item],
    }


def _search_preprint_server(server: str, query: str, options: dict[str, Any]) -> list[dict[str, Any]]:
    doi_match = re.match(r"^10\.\d{4,9}/[-._;()/:A-Z0-9]+$", str(query or "").strip(), flags=re.I)
    if doi_match:
        url = f"https://api.biorxiv.org/details/{server}/{doi_match.group(0)}/na/json"
    else:
        url = _url_with_params(
            f"https://api.biorxiv.org/details/{server}/{options.get('interval', '365d')}/{options.get('cursor', 0)}/json",
            {"category": options.get("category")},
        )
    data = fetch_json(url, {"timeoutMs": options.get("timeoutMs")})
    papers = [_normalize_biorxiv_item(item, server) for item in data.get("collection", [])]
    index = build_literature_index(papers)
    hits = search_literature(index, query, {"limit": options.get("limit", 10), "strategy": options.get("searchStrategy", "hybrid")})
    return [hit["paper"] for hit in hits]


def search_biorxiv(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return _search_preprint_server("biorxiv", query, options or {})


def search_medrxiv(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return _search_preprint_server("medrxiv", query, options or {})


_cached_nber_rows: list[dict[str, Any]] | None = None
_cached_nber_url: str | None = None
DEFAULT_NBER_REF_URL = "https://data.nber.org/nber_paper_chapter_metadata/tsv/ref.tsv"


def _parse_tsv(text: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    if not lines:
        return []
    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        values = line.split("\t")
        rows.append({header: values[index] if index < len(values) else "" for index, header in enumerate(headers)})
    return rows


def _match_paper_id(query: str, row: dict[str, str]) -> bool:
    normalized = str(query or "").strip().lower()
    paper_id = str(row.get("paper") or "").strip().lower()
    paper_url_match = re.search(r"/papers/([wht]\d+)", normalized, flags=re.I)
    return normalized == paper_id or (paper_url_match and paper_url_match.group(1).lower() == paper_id)


def normalize_nber_row(row: dict[str, str]) -> dict[str, Any]:
    paper_id = str(row.get("paper") or "").strip()
    landing_page = f"https://www.nber.org/papers/{paper_id}" if re.match(r"^[wht]\d+$", paper_id, flags=re.I) else None
    return {
        "id": f"nber:{paper_id}",
        "title": row.get("title") or paper_id,
        "abstract": "",
        "authors": [author.strip() for author in re.split(r"\s+and\s+|;", row.get("author") or "", flags=re.I) if author.strip()],
        "year": _extract_year(row.get("issue_date")),
        "venue": "NBER Working Paper",
        "keywords": [],
        "source": "nber",
        "provider": "nber",
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": row.get("doi") or None, "nber": paper_id or None},
        "links": {"landingPage": landing_page, "pdf": None},
        "categories": ["nber_working_paper"],
    }


def _load_nber_rows(options: dict[str, Any]) -> list[dict[str, str]]:
    global _cached_nber_rows, _cached_nber_url
    ref_url = options.get("refUrl") or DEFAULT_NBER_REF_URL
    if not options.get("forceRefresh") and _cached_nber_rows is not None and _cached_nber_url == ref_url:
        return _cached_nber_rows
    text = fetch_text(ref_url, {"timeoutMs": options.get("timeoutMs"), "headers": {"User-Agent": options.get("userAgent")} if options.get("userAgent") else {}})
    rows = [row for row in _parse_tsv(text) if options.get("includeChapters") or re.match(r"^[wht]\d+$", str(row.get("paper") or ""), flags=re.I)]
    _cached_nber_rows = rows
    _cached_nber_url = ref_url
    return rows


def search_nber(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    rows = _load_nber_rows(options)
    query_tokens = unique(tokenize(query))
    scored = []
    for row in rows:
        if _match_paper_id(query, row):
            scored.append((row, 1.0))
            continue
        row_tokens = unique(tokenize(f"{row.get('paper', '')} {row.get('author', '')} {row.get('title', '')}"))
        overlap = len([token for token in query_tokens if token in row_tokens])
        score = overlap / len(query_tokens) if query_tokens else 0
        if score > 0:
            scored.append((row, score))
    candidates = [row for row, _ in sorted(scored, key=lambda item: item[1], reverse=True)[: options.get("prefilterLimit", 200)]]
    papers = [normalize_nber_row(row) for row in candidates]
    index = build_literature_index(papers, default_strategy=options.get("searchStrategy", "hybrid"))
    hits = search_literature(index, query, {"limit": options.get("limit", 10), "strategy": options.get("searchStrategy", "hybrid")})
    return [hit["paper"] for hit in hits]


def normalize_semantic_scholar_paper(paper: dict[str, Any]) -> dict[str, Any]:
    doi = paper.get("externalIds", {}).get("DOI") or paper.get("doi")
    keywords = [clean_text(value) for value in [*(paper.get("fieldsOfStudy") or []), *[field.get("category") for field in paper.get("s2FieldsOfStudy", []) or []]] if clean_text(value)]
    return {
        "id": paper.get("paperId") or paper.get("corpusId") or doi or paper.get("url"),
        "title": clean_text(paper.get("title") or paper.get("url")),
        "abstract": clean_text(paper.get("abstract") or paper.get("tldr", {}).get("text") or ""),
        "authors": [author.get("name") for author in paper.get("authors", []) if author.get("name")],
        "year": paper.get("year"),
        "venue": clean_text(paper.get("venue") or paper.get("journal", {}).get("name") or paper.get("publicationVenue", {}).get("name") or ""),
        "keywords": keywords,
        "source": "semanticscholar",
        "provider": "semanticscholar",
        "providerScore": paper.get("relevanceScore", 0),
        "citationCount": paper.get("citationCount", 0),
        "externalIds": {"doi": doi, "semanticscholar": paper.get("paperId")},
        "links": {
            "landingPage": paper.get("url") or (f"https://www.semanticscholar.org/paper/{paper['paperId']}" if paper.get("paperId") else None),
            "pdf": paper.get("openAccessPdf", {}).get("url"),
        },
        "categories": [item for item in [",".join(paper.get("publicationTypes", []) or [])] + (paper.get("fieldsOfStudy") or []) if item],
    }


def search_semantic_scholar(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    url = _url_with_params(
        "https://api.semanticscholar.org/graph/v1/paper/search",
        {
            "query": query,
            "limit": options.get("limit", 10),
            "fields": options.get(
                "fields",
                ",".join(
                    [
                        "paperId",
                        "title",
                        "abstract",
                        "authors",
                        "year",
                        "venue",
                        "journal",
                        "publicationVenue",
                        "citationCount",
                        "fieldsOfStudy",
                        "s2FieldsOfStudy",
                        "externalIds",
                        "publicationTypes",
                        "openAccessPdf",
                        "url",
                        "tldr",
                    ]
                ),
            ),
            "offset": options.get("offset"),
        },
    )
    headers = {}
    if options.get("apiKey"):
        headers["x-api-key"] = options["apiKey"]
    if options.get("userAgent"):
        headers["User-Agent"] = options["userAgent"]
    data = fetch_json(url, {"headers": headers, "timeoutMs": options.get("timeoutMs")})
    return [normalize_semantic_scholar_paper(item) for item in data.get("data", [])]


def normalize_science_direct_entry(entry: dict[str, Any]) -> dict[str, Any]:
    landing = None
    for link in entry.get("link", []) or []:
        if link.get("@ref") in {"scidir", "self"} and link.get("@href"):
            landing = link["@href"]
            if link.get("@ref") == "scidir":
                break
    return {
        "id": entry.get("prism:doi") or entry.get("dc:identifier") or landing,
        "title": clean_text(entry.get("dc:title") or entry.get("title") or ""),
        "abstract": clean_text(entry.get("dc:description") or entry.get("description") or ""),
        "authors": _split_authors(entry.get("dc:creator") or entry.get("authors", {}).get("author"), r";|,"),
        "year": _extract_year(entry.get("prism:coverDate") or entry.get("date")),
        "venue": clean_text(entry.get("prism:publicationName") or ""),
        "keywords": [],
        "source": "sciencedirect",
        "provider": "sciencedirect",
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": entry.get("prism:doi"), "sciencedirect": entry.get("dc:identifier")},
        "links": {"landingPage": landing, "pdf": None},
        "categories": [item for item in [entry.get("subtypeDescription"), entry.get("prism:aggregationType")] if item],
    }


def search_sciencedirect(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    api_key = options.get("apiKey")
    if not api_key:
        raise RuntimeError("Missing Elsevier API key")
    url = _url_with_params("https://api.elsevier.com/content/search/sciencedirect", {"query": query, "count": options.get("limit", 10), "start": options.get("offset")})
    data = fetch_json(url, {"headers": {"X-ELS-APIKey": api_key, **({"User-Agent": options["userAgent"]} if options.get("userAgent") else {})}, "timeoutMs": options.get("timeoutMs")})
    return [normalize_science_direct_entry(entry) for entry in data.get("search-results", {}).get("entry", [])]


def normalize_springer_record(record: dict[str, Any]) -> dict[str, Any]:
    urls = record.get("url", []) or []
    return {
        "id": record.get("doi") or record.get("identifier") or (urls[0].get("value") if urls else None),
        "title": clean_text(record.get("title") or ""),
        "abstract": clean_text(record.get("abstract") or ""),
        "authors": [clean_text(creator.get("creator") or creator.get("name") or "") for creator in record.get("creators", []) if clean_text(creator.get("creator") or creator.get("name") or "")],
        "year": _extract_year(record.get("publicationDate") or record.get("coverDate")),
        "venue": clean_text(record.get("publicationName") or record.get("publisher") or ""),
        "keywords": [clean_text(keyword) for keyword in record.get("keyword", []) if clean_text(keyword)],
        "source": "springer",
        "provider": "springer",
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": record.get("doi"), "springer": record.get("identifier")},
        "links": {
            "landingPage": next((item.get("value") for item in urls if item.get("format") == "html"), None) or (urls[0].get("value") if urls else None),
            "pdf": next((item.get("value") for item in urls if item.get("format") == "pdf"), None),
        },
        "categories": [item for item in [record.get("contentType"), *(record.get("subject") or [])] if item],
    }


def search_springer(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    api_key = options.get("apiKey")
    if not api_key:
        raise RuntimeError("Missing Springer API key")
    url = _url_with_params("https://api.springernature.com/meta/v2/json", {"q": query, "p": options.get("limit", 10), "s": options.get("offset"), "api_key": api_key})
    data = fetch_json(url, {"headers": {"User-Agent": options.get("userAgent")} if options.get("userAgent") else {}, "timeoutMs": options.get("timeoutMs")})
    return [normalize_springer_record(record) for record in data.get("records", [])]


def normalize_zotero_item(item: dict[str, Any]) -> dict[str, Any]:
    data = item.get("data", item)
    authors = []
    for creator in data.get("creators", []):
        name = creator.get("name") or " ".join(part for part in [creator.get("firstName"), creator.get("lastName")] if part).strip()
        if name:
            authors.append(name)
    tags = [tag if isinstance(tag, str) else tag.get("tag") for tag in data.get("tags", [])]
    return {
        "id": data.get("key") or item.get("key") or data.get("version") or str(uuid.uuid4()),
        "title": data.get("title") or data.get("shortTitle") or data.get("subject") or "Untitled Zotero item",
        "abstract": data.get("abstractNote") or "",
        "authors": authors,
        "year": _extract_year(data.get("date")),
        "venue": data.get("publicationTitle") or data.get("proceedingsTitle") or data.get("repository") or data.get("websiteTitle") or data.get("blogTitle") or "",
        "keywords": [tag for tag in tags if tag],
        "source": "zotero",
        "provider": "zotero",
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": data.get("DOI"), "zotero": data.get("key") or item.get("key")},
        "links": {"landingPage": item.get("links", {}).get("alternate", {}).get("href"), "pdf": None},
        "categories": [data.get("itemType")] if data.get("itemType") else [],
    }


def search_zotero(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    library_id = options.get("libraryId")
    if not library_id:
        raise RuntimeError("Missing Zotero library id")
    url = _url_with_params(
        f"https://api.zotero.org/{options.get('libraryType', 'users')}/{library_id}/items",
        {"q": query, "qmode": options.get("qmode", "everything"), "limit": options.get("limit", 10), "format": "json", "include": "data"},
    )
    headers = {"Zotero-API-Version": "3"}
    if options.get("apiKey"):
        headers["Zotero-API-Key"] = options["apiKey"]
    items = fetch_json(url, {"headers": headers, "timeoutMs": options.get("timeoutMs")})
    return [normalize_zotero_item(item) for item in items]


def parse_bibtex(input_text: str) -> list[dict[str, Any]]:
    def read_balanced_block(text: str, start_index: int, open_char: str, close_char: str) -> tuple[str, int]:
        depth = 0
        index = start_index
        while index < len(text):
            char = text[index]
            if char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[start_index + 1 : index], index + 1
            index += 1
        return text[start_index + 1 :], len(text)

    def parse_quoted_value(text: str, start_index: int) -> tuple[str, int]:
        index = start_index + 1
        value = []
        while index < len(text):
            char = text[index]
            if char == '"' and text[index - 1] != "\\":
                return "".join(value), index + 1
            value.append(char)
            index += 1
        return "".join(value), len(text)

    def parse_raw_value(text: str, start_index: int) -> tuple[str, int]:
        index = start_index
        while index < len(text) and text[index] != ",":
            index += 1
        return text[start_index:index].strip(), index

    def parse_bibtex_fields(body: str) -> dict[str, str]:
        fields: dict[str, str] = {}
        index = 0
        while index < len(body):
            while index < len(body) and re.match(r"[\s,]", body[index]):
                index += 1
            if index >= len(body):
                break
            equals_index = body.find("=", index)
            if equals_index == -1:
                break
            field_name = body[index:equals_index].strip().lower()
            index = equals_index + 1
            while index < len(body) and body[index].isspace():
                index += 1
            if index < len(body) and body[index] == "{":
                value, next_index = read_balanced_block(body, index, "{", "}")
            elif index < len(body) and body[index] == '"':
                value, next_index = parse_quoted_value(body, index)
            else:
                value, next_index = parse_raw_value(body, index)
            fields[field_name] = clean_text(value)
            index = next_index + 1
        return fields

    def normalize_bibtex_authors(value: str) -> list[str]:
        authors = []
        for author in re.split(r"\s+and\s+", str(value or ""), flags=re.I):
            author = author.strip()
            if not author:
                continue
            if "," not in author:
                authors.append(author)
                continue
            family, given = [part.strip() for part in author.split(",", 1)]
            authors.append(" ".join(part for part in [given, family] if part).strip())
        return authors

    entries = []
    index = 0
    while index < len(input_text):
        at_index = input_text.find("@", index)
        if at_index == -1:
            break
        open_offset = re.search(r"[{(]", input_text[at_index:])
        if not open_offset:
            break
        open_index = at_index + open_offset.start()
        entry_type = input_text[at_index + 1 : open_index].strip().lower()
        open_char = input_text[open_index]
        close_char = "}" if open_char == "{" else ")"
        block, next_index = read_balanced_block(input_text, open_index, open_char, close_char)
        first_comma = block.find(",")
        if first_comma == -1:
            index = next_index
            continue
        key = block[:first_comma].strip()
        fields = parse_bibtex_fields(block[first_comma + 1 :])
        entries.append(
            {
                "id": key,
                "key": key,
                "itemType": entry_type,
                "title": fields.get("title") or key,
                "abstractNote": fields.get("abstract") or "",
                "creators": [{"name": name} for name in normalize_bibtex_authors(fields.get("author", ""))],
                "publicationTitle": fields.get("journal") or fields.get("booktitle") or fields.get("publisher") or "",
                "date": fields.get("date") or fields.get("year") or "",
                "DOI": fields.get("doi") or "",
                "url": fields.get("url") or "",
                "tags": [tag.strip() for tag in re.split(r",|;", fields.get("keywords") or fields.get("keyword") or "") if tag.strip()],
            }
        )
        index = next_index
    return entries


def normalize_local_item(item: dict[str, Any]) -> dict[str, Any]:
    def normalize_creators(creators: list[Any]) -> list[str]:
        authors = []
        for creator in creators:
            if isinstance(creator, str):
                authors.append(creator)
            else:
                name = creator.get("name") or " ".join(part for part in [creator.get("firstName"), creator.get("lastName")] if part).strip()
                if name:
                    authors.append(name)
        return authors

    def normalize_tags(tags: Any) -> list[str]:
        if isinstance(tags, str):
            return [tag.strip() for tag in re.split(r",|;", tags) if tag.strip()]
        result = []
        for tag in tags or []:
            result.append(tag if isinstance(tag, str) else tag.get("tag") or tag.get("name"))
        return [tag for tag in result if tag]

    def normalize_csl_authors(authors: list[dict[str, Any]]) -> list[str]:
        result = []
        for author in authors:
            name = author.get("literal") or " ".join(part for part in [author.get("given"), author.get("family")] if part).strip()
            if name:
                result.append(name)
        return result

    authors = item.get("authors") or normalize_creators(item.get("creators", [])) or normalize_csl_authors(item.get("author", []))
    return {
        "id": item.get("id") or item.get("key") or item.get("DOI") or item.get("title"),
        "title": item.get("title") or item.get("display_name") or "Untitled local item",
        "abstract": item.get("abstract") or item.get("abstractNote") or item.get("summary") or "",
        "authors": authors,
        "year": item.get("year") or _extract_year(item.get("date") or item.get("issued")),
        "venue": item.get("venue") or item.get("publicationTitle") or _first_value(item.get("container-title")) or item.get("container_title") or item.get("journal") or item.get("repository") or "",
        "keywords": item.get("keywords") or normalize_tags(item.get("tags") or item.get("keyword") or []),
        "source": "local",
        "provider": "local",
        "providerScore": 0,
        "citationCount": item.get("citationCount", 0),
        "externalIds": {"doi": item.get("DOI") or item.get("doi"), "local": item.get("id") or item.get("key")},
        "links": {"landingPage": item.get("url") or item.get("URL"), "pdf": item.get("pdf")},
        "categories": item.get("categories") or ([item.get("itemType")] if item.get("itemType") else []),
    }


def load_local_library(library_path: str) -> list[dict[str, Any]]:
    if not library_path:
        raise RuntimeError("Missing local library path")
    path = Path(library_path).expanduser().resolve()
    if path.is_dir():
        items = []
        for entry in sorted(path.iterdir()):
            if entry.suffix not in {".json", ".bib"}:
                continue
            items.extend(_read_library_file(entry))
        return items
    return _read_library_file(path)


def _read_library_file(path: Path) -> list[dict[str, Any]]:
    if path.suffix == ".bib":
        return parse_bibtex(path.read_text(encoding="utf-8"))
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    return data.get("items") or data.get("results") or []


def search_local_library(query: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    papers = [normalize_local_item(item) for item in load_local_library(options.get("path") or options.get("libraryPath"))]
    index = build_literature_index(papers)
    hits = search_literature(index, query, {"limit": options.get("limit", 10), "strategy": options.get("searchStrategy", "hybrid")})
    return {"papers": [hit["paper"] for hit in hits], "hits": hits, "index": index}


def _parse_attributes(tag: str) -> dict[str, str]:
    attributes = {}
    for match in re.finditer(r'([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|\'([^\']*)\')', tag):
        attributes[match.group(1).lower()] = clean_text(match.group(3) or match.group(4) or "")
    return attributes


def _collect_meta_tags(html: str) -> list[dict[str, str]]:
    tags = []
    for match in re.finditer(r"<meta\b[^>]*>", html, flags=re.I):
        attributes = _parse_attributes(match.group(0))
        key = attributes.get("name") or attributes.get("property") or attributes.get("http-equiv")
        content = attributes.get("content")
        if key and content:
            tags.append({"key": key.lower(), "content": content})
    return tags


def _extract_json_ld_blocks(html: str) -> list[dict[str, Any]]:
    blocks = []
    for match in re.finditer(r'<script\b[^>]*type=("|\\\')application/ld\+json\1[^>]*>([\s\S]*?)</script>', html, flags=re.I):
        raw = clean_text(match.group(2)).strip()
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        blocks.extend(parsed if isinstance(parsed, list) else [parsed])
    return blocks


def _pick_meta(meta_map: dict[str, list[str]], keys: list[str]) -> Any:
    for key in keys:
        values = [value for value in meta_map.get(key, []) if value]
        if len(values) == 1:
            return values[0]
        if len(values) > 1:
            return values
    return None


def _build_meta_map(tags: list[dict[str, str]]) -> dict[str, list[str]]:
    meta_map: dict[str, list[str]] = {}
    for tag in tags:
        meta_map.setdefault(tag["key"], []).append(tag["content"])
    return meta_map


def _normalize_authors(value: Any) -> list[str]:
    if isinstance(value, list):
        return [author for item in value for author in _normalize_authors(item)]
    if not value:
        return []
    if isinstance(value, dict):
        name = value.get("name") or " ".join(part for part in [value.get("givenName"), value.get("familyName")] if part).strip()
        return [name] if name else []
    return [str(value)]


def _normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        return [keyword for item in value for keyword in _normalize_keywords(item)]
    if not value:
        return []
    return [item.strip() for item in re.split(r"[;,]", str(value)) if item.strip()]


def _normalize_web_document(url: str, final_url: str, html: str) -> dict[str, Any]:
    meta_tags = _collect_meta_tags(html)
    meta_map = _build_meta_map(meta_tags)
    json_ld_blocks = _extract_json_ld_blocks(html)
    json_ld = next(
        (
            block
            for block in json_ld_blocks
            if any(item in {"ScholarlyArticle", "Article", "CreativeWork", "TechArticle"} for item in (_as_array(block.get("@type"))))
        ),
        json_ld_blocks[0] if json_ld_blocks else {},
    )
    title = _pick_meta(meta_map, ["citation_title", "dc.title", "og:title", "twitter:title"]) or json_ld.get("headline") or json_ld.get("name") or clean_text(re.search(r"<title>([\s\S]*?)</title>", html, flags=re.I).group(1) if re.search(r"<title>([\s\S]*?)</title>", html, flags=re.I) else "") or final_url
    abstract = _pick_meta(meta_map, ["citation_abstract", "description", "dc.description", "og:description", "twitter:description"]) or json_ld.get("description") or ""
    authors = [*_normalize_authors(_pick_meta(meta_map, ["citation_author", "dc.creator"])), *_normalize_authors(json_ld.get("author"))]
    venue = _pick_meta(meta_map, ["citation_journal_title", "prism.publicationname", "citation_conference_title"]) or json_ld.get("isPartOf", {}).get("name") or json_ld.get("publisher", {}).get("name") or ""
    date = _pick_meta(meta_map, ["citation_publication_date", "article:published_time", "dc.date"]) or json_ld.get("datePublished") or ""
    doi_raw = _pick_meta(meta_map, ["citation_doi", "dc.identifier", "prism.doi"]) or json_ld.get("identifier") or ""
    doi_match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", str(_first_value(doi_raw) if isinstance(doi_raw, list) else doi_raw or ""), flags=re.I)
    doi = doi_match.group(0) if doi_match else None
    pdf_url = _pick_meta(meta_map, ["citation_pdf_url"])
    if not pdf_url:
        encoding = json_ld.get("encoding")
        if isinstance(encoding, list):
            pdf_url = next((item.get("contentUrl") for item in encoding if "pdf" in str(item.get("fileFormat", "")).lower()), None)
        elif isinstance(encoding, dict):
            pdf_url = encoding.get("contentUrl")
    return {
        "id": doi or final_url,
        "title": _first_value(title) if isinstance(title, list) else title,
        "abstract": _first_value(abstract) if isinstance(abstract, list) else abstract,
        "authors": list(dict.fromkeys(author for author in authors if author)),
        "year": _extract_year(_first_value(date) if isinstance(date, list) else date),
        "venue": _first_value(venue) if isinstance(venue, list) else venue,
        "keywords": list(dict.fromkeys([*_normalize_keywords(_pick_meta(meta_map, ["citation_keywords", "keywords"])), *_normalize_keywords(json_ld.get("keywords"))])),
        "source": "web",
        "provider": "web",
        "providerScore": 0,
        "citationCount": 0,
        "externalIds": {"doi": doi, "web": final_url},
        "links": {"landingPage": final_url, "pdf": _first_value(pdf_url) if isinstance(pdf_url, list) else pdf_url},
        "categories": ["web_metadata"],
    }


def fetch_web_metadata(url: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    request = Request(url, headers={"Accept": "text/html,application/xhtml+xml", "User-Agent": options.get("userAgent") or "research-idea-explorer/0.2 web-metadata", **options.get("headers", {})})
    with urlopen(request, timeout=_build_timeout(options)) as response:
        if getattr(response, "status", 200) >= 400:
            raise RuntimeError(f"Request failed with {response.status} for {url}")
        final_url = response.geturl()
        html = response.read().decode("utf-8", errors="replace")
    return _normalize_web_document(url, final_url, html)


def search_web_metadata(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    urls = list(options.get("webUrls") or [])
    trimmed = str(query or "").strip()
    if not urls:
        if re.match(r"^https?://", trimmed, flags=re.I):
            urls = [trimmed]
        elif re.match(r"^10\.\d{4,9}/", trimmed, flags=re.I):
            urls = [f"https://doi.org/{trimmed}"]
    if not urls:
        raise RuntimeError("Web provider requires a URL, DOI, or explicit webUrls list")
    return [fetch_web_metadata(url, options) for url in urls]


def search_ssrn(query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    urls = [url for url in (options.get("ssrnUrls") or options.get("webUrls") or []) if re.search(r"ssrn\.com|papers\.ssrn\.com", str(url), flags=re.I)]
    trimmed = str(query or "").strip()
    if not urls and re.search(r"ssrn\.com|papers\.ssrn\.com", trimmed, flags=re.I):
        urls = [trimmed]
    if not urls:
        raise RuntimeError("SSRN provider currently supports direct SSRN URLs via --web-url or an SSRN URL query.")
    results = [fetch_web_metadata(url, {"timeoutMs": options.get("timeoutMs"), "userAgent": options.get("userAgent")}) for url in urls]
    for result in results:
        result["source"] = "ssrn"
        result["provider"] = "ssrn"
        result["categories"] = list(dict.fromkeys([*(result.get("categories") or []), "ssrn_preprint"]))
    return results


BIOMEDICAL_HINTS = [
    "bio",
    "biomedical",
    "biology",
    "medical",
    "medicine",
    "clinical",
    "patient",
    "disease",
    "genome",
    "genomic",
    "gene",
    "protein",
    "cell",
    "drug",
    "therapy",
    "oncology",
    "cancer",
    "epidemiology",
    "trial",
    "diagnosis",
    "diagnostic",
    "pathway",
    "rna",
    "dna",
]

ECONOMICS_HINTS = [
    "economics",
    "economic",
    "finance",
    "financial",
    "business",
    "management",
    "market",
    "labor",
    "wage",
    "wages",
    "trade",
    "inflation",
    "monetary",
    "tax",
    "productivity",
    "entrepreneurship",
    "corporate finance",
    "household finance",
    "public economics",
    "industrial organization",
    "unemployment",
]


def _looks_biomedical(query: str, options: dict[str, Any]) -> bool:
    domain = str(options.get("domain") or options.get("focus", {}).get("domain") or "").lower()
    if domain in {"bio", "biomedical", "biology", "medical", "medicine", "health", "clinical"}:
        return True
    normalized_query = normalize_text(query)
    return any(hint in normalized_query for hint in BIOMEDICAL_HINTS)


def _looks_economics(query: str, options: dict[str, Any]) -> bool:
    domain = str(options.get("domain") or options.get("focus", {}).get("domain") or "").lower()
    if domain in {"economics", "econ", "finance", "business", "management"}:
        return True
    normalized_query = normalize_text(query)
    return any(hint in normalized_query for hint in ECONOMICS_HINTS)


def _should_use_web_provider(query: str, options: dict[str, Any]) -> bool:
    if "web" in (options.get("providers") or []):
        return True
    if options.get("webUrls"):
        return True
    trimmed = str(query or "").strip()
    return bool(re.match(r"^https?://", trimmed, flags=re.I) or re.match(r"^10\.\d{4,9}/", trimmed, flags=re.I))


def _get_default_providers(query: str, options: dict[str, Any]) -> list[str]:
    providers = ["openalex", "crossref", "arxiv"]
    if _looks_biomedical(query, options):
        providers.extend(["europepmc", "biorxiv", "medrxiv"])
    if _looks_economics(query, options):
        providers.append("nber")
    if _should_use_web_provider(query, options):
        providers.append("web")
    return list(dict.fromkeys(providers))


def _dedupe_papers(papers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for paper in papers:
        key = paper.get("externalIds", {}).get("doi") or paper.get("id") or normalize_text(f"{paper.get('title')}|{','.join(paper.get('authors', []))}|{paper.get('year') or ''}")
        existing = seen.get(key)
        if not existing:
            seen[key] = {**paper, "providers": [paper.get("provider")] if paper.get("provider") else []}
            continue
        seen[key] = {
            **existing,
            "abstract": existing.get("abstract") or paper.get("abstract"),
            "venue": existing.get("venue") or paper.get("venue"),
            "keywords": list(dict.fromkeys([*(existing.get("keywords") or []), *(paper.get("keywords") or [])])),
            "categories": list(dict.fromkeys([*(existing.get("categories") or []), *(paper.get("categories") or [])])),
            "providers": list(dict.fromkeys([*(existing.get("providers") or []), paper.get("provider")])),
        }
    return list(seen.values())


def search_literature_sources(query: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    providers = options.get("providers") or _get_default_providers(query, options)
    per_provider_limit = int(options.get("perProviderLimit", 8))
    settled: list[Any] = []

    def protect(provider_name: str, fn, provider_options: dict[str, Any]) -> None:
        try:
            settled.append(fn(query, provider_options))
        except Exception as error:  # noqa: BLE001
            settled.append({"provider": provider_name, "error": error})

    if "openalex" in providers:
        protect("openalex", search_openalex, {"limit": per_provider_limit, "apiKey": options.get("openAlexApiKey"), "timeoutMs": options.get("timeoutMs"), "filter": options.get("openAlexFilter"), "userAgent": options.get("userAgent")})
    if "arxiv" in providers:
        protect("arxiv", search_arxiv, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "categories": options.get("arxivCategories"), "email": options.get("arxivContactEmail"), "userAgent": options.get("userAgent")})
    if "crossref" in providers:
        protect("crossref", search_crossref, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "mailto": options.get("crossrefMailto"), "userAgent": options.get("userAgent"), "filter": options.get("crossrefFilter")})
    if "nber" in providers:
        protect("nber", search_nber, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "userAgent": options.get("userAgent"), "refUrl": options.get("nberRefUrl"), "includeChapters": options.get("nberIncludeChapters"), "searchStrategy": options.get("searchStrategy")})
    if "semanticscholar" in providers:
        protect("semanticscholar", search_semantic_scholar, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "apiKey": options.get("semanticScholarApiKey"), "userAgent": options.get("userAgent")})
    if "ssrn" in providers:
        protect("ssrn", search_ssrn, {"timeoutMs": options.get("timeoutMs"), "userAgent": options.get("userAgent"), "ssrnUrls": options.get("ssrnUrls"), "webUrls": options.get("webUrls")})
    if "europepmc" in providers:
        protect("europepmc", search_europe_pmc, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "email": options.get("europePmcEmail"), "userAgent": options.get("userAgent"), "sort": options.get("europePmcSort"), "resultType": options.get("europePmcResultType")})
    if "biorxiv" in providers:
        protect("biorxiv", search_biorxiv, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "interval": options.get("biorxivInterval"), "category": options.get("biorxivCategory"), "searchStrategy": options.get("searchStrategy")})
    if "medrxiv" in providers:
        protect("medrxiv", search_medrxiv, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "interval": options.get("medrxivInterval"), "category": options.get("medrxivCategory"), "searchStrategy": options.get("searchStrategy")})
    if "zotero" in providers:
        protect("zotero", search_zotero, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "libraryType": options.get("zoteroLibraryType"), "libraryId": options.get("zoteroLibraryId"), "apiKey": options.get("zoteroApiKey")})
    if "sciencedirect" in providers:
        protect("sciencedirect", search_sciencedirect, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "apiKey": options.get("elsevierApiKey"), "userAgent": options.get("userAgent")})
    if "springer" in providers:
        protect("springer", search_springer, {"limit": per_provider_limit, "timeoutMs": options.get("timeoutMs"), "apiKey": options.get("springerApiKey"), "userAgent": options.get("userAgent")})
    if "local" in providers:
        try:
            settled.append(search_local_library(query, {"limit": per_provider_limit, "libraryPath": options.get("localLibraryPath"), "searchStrategy": options.get("searchStrategy")})["papers"])
        except Exception as error:  # noqa: BLE001
            settled.append({"provider": "local", "error": error})
    if "web" in providers:
        protect("web", search_web_metadata, {"webUrls": options.get("webUrls"), "timeoutMs": options.get("timeoutMs"), "userAgent": options.get("userAgent")})

    errors = [item for item in settled if not isinstance(item, list)]
    raw_papers = [paper for item in settled if isinstance(item, list) for paper in item]
    papers = _dedupe_papers(raw_papers)
    index = build_literature_index(papers)
    ranked_hits = search_literature(index, query, {"limit": options.get("rankLimit") or min(10, len(papers) or 10), "strategy": options.get("searchStrategy", "hybrid")})
    return {"query": query, "providers": providers, "papers": papers, "errors": errors, "rankedHits": ranked_hits, "index": index}

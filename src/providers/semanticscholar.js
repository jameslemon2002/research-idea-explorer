import { cleanText, fetchJson } from "./base.js";

function normalizeAuthors(authors = []) {
  return authors.map((author) => author.name).filter(Boolean);
}

function normalizeKeywords(paper) {
  return [
    ...(paper.fieldsOfStudy || []),
    ...((paper.s2FieldsOfStudy || []).map((field) => field.category) || [])
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);
}

export function normalizeSemanticScholarPaper(paper) {
  const doi = paper.externalIds?.DOI || paper.doi || null;

  return {
    id: paper.paperId || paper.corpusId || doi || paper.url,
    title: cleanText(paper.title || paper.url),
    abstract: cleanText(paper.abstract || paper.tldr?.text || ""),
    authors: normalizeAuthors(paper.authors || []),
    year: paper.year || null,
    venue: cleanText(paper.venue || paper.journal?.name || paper.publicationVenue?.name || ""),
    keywords: normalizeKeywords(paper),
    source: "semanticscholar",
    provider: "semanticscholar",
    providerScore: paper.relevanceScore || 0,
    citationCount: paper.citationCount || 0,
    externalIds: {
      doi,
      semanticscholar: paper.paperId || null
    },
    links: {
      landingPage: paper.url || (paper.paperId ? `https://www.semanticscholar.org/paper/${paper.paperId}` : null),
      pdf: paper.openAccessPdf?.url || null
    },
    categories: [paper.publicationTypes?.join(", "), ...(paper.fieldsOfStudy || [])].filter(Boolean)
  };
}

export function buildSemanticScholarUrl(query, options = {}) {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(options.limit || 10));
  url.searchParams.set(
    "fields",
    options.fields ||
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
        "tldr"
      ].join(",")
  );
  if (options.offset) {
    url.searchParams.set("offset", String(options.offset));
  }
  return url.toString();
}

export async function searchSemanticScholar(query, options = {}) {
  const data = await fetchJson(buildSemanticScholarUrl(query, options), {
    headers: {
      ...(options.apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY
        ? { "x-api-key": options.apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY }
        : {}),
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data.data || []).map(normalizeSemanticScholarPaper);
}

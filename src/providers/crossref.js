import { cleanText, fetchJson } from "./base.js";

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAuthors(authors = []) {
  return authors
    .map((author) => [author.given, author.family].filter(Boolean).join(" ").trim() || author.name)
    .filter(Boolean);
}

function extractYear(item) {
  const parts =
    item.issued?.["date-parts"]?.[0] ||
    item.published?.["date-parts"]?.[0] ||
    item.created?.["date-parts"]?.[0] ||
    [];
  return parts[0] || null;
}

function pickPdfLink(links = []) {
  return (
    links.find((link) => String(link["content-type"] || "").includes("pdf"))?.URL ||
    links.find((link) => link.URL)?.URL ||
    null
  );
}

export function normalizeCrossrefItem(item) {
  return {
    id: item.DOI || item.URL,
    title: cleanText(firstValue(item.title) || item.URL),
    abstract: cleanText(item.abstract || ""),
    authors: normalizeAuthors(item.author || []),
    year: extractYear(item),
    venue: cleanText(firstValue(item["container-title"]) || ""),
    keywords: (item.subject || []).map((subject) => cleanText(subject)).filter(Boolean),
    source: "crossref",
    provider: "crossref",
    providerScore: item.score || 0,
    citationCount: item["is-referenced-by-count"] || 0,
    externalIds: {
      doi: item.DOI || null,
      crossref: item.URL || null
    },
    links: {
      landingPage: item.URL || null,
      pdf: pickPdfLink(item.link || [])
    },
    categories: [item.type].filter(Boolean)
  };
}

export function buildCrossrefUrl(query, options = {}) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", String(options.limit || 10));
  if (options.mailto || process.env.CROSSREF_MAILTO) {
    url.searchParams.set("mailto", options.mailto || process.env.CROSSREF_MAILTO);
  }
  if (options.filter) {
    url.searchParams.set("filter", options.filter);
  }
  if (options.select) {
    url.searchParams.set("select", options.select);
  }
  return url.toString();
}

export async function searchCrossref(query, options = {}) {
  const data = await fetchJson(buildCrossrefUrl(query, options), {
    headers: {
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data.message?.items || []).map(normalizeCrossrefItem);
}


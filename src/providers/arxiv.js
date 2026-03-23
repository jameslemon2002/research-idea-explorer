import { cleanText, fetchText } from "./base.js";

let lastArxivRequestAt = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDefaultUserAgent(options = {}) {
  const email = options.email || process.env.ARXIV_CONTACT_EMAIL || "contact@example.com";
  return options.userAgent || `research-space-explorer/0.1 (${email})`;
}

function extractFirst(xml, pattern) {
  const match = xml.match(pattern);
  return match ? cleanText(match[1]) : "";
}

function extractAll(xml, pattern) {
  return [...xml.matchAll(pattern)].map((match) => cleanText(match[1])).filter(Boolean);
}

function extractCategories(xml) {
  return [...xml.matchAll(/<category\b[^>]*term="([^"]+)"[^>]*\/?>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function extractPdfUrl(xml) {
  const pdfMatch = xml.match(/<link\b[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*\/?>/i);
  return pdfMatch ? cleanText(pdfMatch[1]) : null;
}

export function buildArxivSearchQuery(query, options = {}) {
  if (options.rawSearchQuery) {
    return options.rawSearchQuery;
  }

  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return "all:*";
  }

  const phrase = trimmed.includes(" ") ? `all:"${trimmed}"` : `all:${trimmed}`;
  if (!options.categories?.length) {
    return phrase;
  }

  const categoryClause = options.categories.map((category) => `cat:${category}`).join(" OR ");
  return `(${phrase}) AND (${categoryClause})`;
}

export function buildArxivUrl(query, options = {}) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", buildArxivSearchQuery(query, options));
  url.searchParams.set("start", String(options.start || 0));
  url.searchParams.set("max_results", String(options.limit || 10));
  url.searchParams.set("sortBy", options.sortBy || "relevance");
  url.searchParams.set("sortOrder", options.sortOrder || "descending");
  return url.toString();
}

export function parseArxivFeed(xml) {
  const entries = xml
    .split(/<entry>/i)
    .slice(1)
    .map((chunk) => `<entry>${chunk.split(/<\/entry>/i)[0]}</entry>`);

  return entries.map((entry) => {
    const id = extractFirst(entry, /<id>([\s\S]*?)<\/id>/i);
    const title = extractFirst(entry, /<title>([\s\S]*?)<\/title>/i);
    const abstract = extractFirst(entry, /<summary>([\s\S]*?)<\/summary>/i);
    const authors = extractAll(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi);
    const categories = extractCategories(entry);
    const published = extractFirst(entry, /<published>([\s\S]*?)<\/published>/i);
    const updated = extractFirst(entry, /<updated>([\s\S]*?)<\/updated>/i);
    const doi = extractFirst(entry, /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i) || null;
    const journalRef = extractFirst(entry, /<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/i);
    const primaryCategory = extractFirst(entry, /<arxiv:primary_category[^>]*term="([^"]+)"/i);

    return {
      id,
      title,
      abstract,
      authors,
      year: published ? Number(published.slice(0, 4)) : null,
      venue: journalRef || "arXiv",
      keywords: categories,
      source: "arxiv",
      provider: "arxiv",
      providerScore: 0,
      citationCount: 0,
      externalIds: {
        doi,
        arxiv: id
      },
      links: {
        landingPage: id || null,
        pdf: extractPdfUrl(entry)
      },
      categories: primaryCategory ? [primaryCategory, ...categories] : categories,
      published,
      updated
    };
  });
}

export async function searchArxiv(query, options = {}) {
  const now = Date.now();
  const elapsed = now - lastArxivRequestAt;
  const minIntervalMs = options.minIntervalMs || 3000;

  if (elapsed < minIntervalMs) {
    await wait(minIntervalMs - elapsed);
  }

  const xml = await fetchText(buildArxivUrl(query, options), {
    headers: {
      Accept: "application/atom+xml",
      "User-Agent": buildDefaultUserAgent(options)
    },
    accept: "application/atom+xml",
    timeoutMs: options.timeoutMs
  });

  lastArxivRequestAt = Date.now();
  return parseArxivFeed(xml);
}

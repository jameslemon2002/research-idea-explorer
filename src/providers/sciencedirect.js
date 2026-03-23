import { cleanText, fetchJson } from "./base.js";

function splitAuthors(value) {
  return String(value || "")
    .split(/;|,/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function normalizeScienceDirectEntry(entry) {
  return {
    id: entry["prism:doi"] || entry["dc:identifier"] || entry.link?.find((item) => item["@ref"] === "self")?.["@href"],
    title: cleanText(entry["dc:title"] || entry.title || ""),
    abstract: cleanText(entry["dc:description"] || entry.description || ""),
    authors: splitAuthors(entry["dc:creator"] || entry.authors?.author || ""),
    year: extractYear(entry["prism:coverDate"] || entry.date || ""),
    venue: cleanText(entry["prism:publicationName"] || ""),
    keywords: [],
    source: "sciencedirect",
    provider: "sciencedirect",
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi: entry["prism:doi"] || null,
      sciencedirect: entry["dc:identifier"] || null
    },
    links: {
      landingPage:
        entry.link?.find((item) => item["@ref"] === "scidir")?.["@href"] ||
        entry.link?.find((item) => item["@ref"] === "self")?.["@href"] ||
        null,
      pdf: null
    },
    categories: [entry["subtypeDescription"], entry["prism:aggregationType"]].filter(Boolean)
  };
}

export function buildScienceDirectUrl(query, options = {}) {
  const url = new URL("https://api.elsevier.com/content/search/sciencedirect");
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(options.limit || 10));
  if (options.offset) {
    url.searchParams.set("start", String(options.offset));
  }
  return url.toString();
}

export async function searchScienceDirect(query, options = {}) {
  const apiKey = options.apiKey || process.env.ELSEVIER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Elsevier API key");
  }

  const data = await fetchJson(buildScienceDirectUrl(query, options), {
    headers: {
      "X-ELS-APIKey": apiKey,
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data["search-results"]?.entry || []).map(normalizeScienceDirectEntry);
}

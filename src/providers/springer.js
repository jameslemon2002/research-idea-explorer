import { cleanText, fetchJson } from "./base.js";

function normalizeCreators(creators = []) {
  return creators
    .map((creator) => creator.creator || creator.name || "")
    .map((author) => cleanText(author))
    .filter(Boolean);
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function normalizeSpringerRecord(record) {
  return {
    id: record.doi || record.identifier || record.url?.[0]?.value,
    title: cleanText(record.title || ""),
    abstract: cleanText(record.abstract || ""),
    authors: normalizeCreators(record.creators || []),
    year: extractYear(record.publicationDate || record.coverDate || ""),
    venue: cleanText(record.publicationName || record.publisher || ""),
    keywords: (record.keyword || []).map((keyword) => cleanText(keyword)).filter(Boolean),
    source: "springer",
    provider: "springer",
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi: record.doi || null,
      springer: record.identifier || null
    },
    links: {
      landingPage: record.url?.find((item) => item.format === "html")?.value || record.url?.[0]?.value || null,
      pdf: record.url?.find((item) => item.format === "pdf")?.value || null
    },
    categories: [record.contentType, ...(record.subject || [])].filter(Boolean)
  };
}

export function buildSpringerUrl(query, options = {}) {
  const url = new URL("https://api.springernature.com/meta/v2/json");
  url.searchParams.set("q", query);
  url.searchParams.set("p", String(options.limit || 10));
  if (options.offset) {
    url.searchParams.set("s", String(options.offset));
  }
  if (options.apiKey || process.env.SPRINGER_API_KEY) {
    url.searchParams.set("api_key", options.apiKey || process.env.SPRINGER_API_KEY);
  }
  return url.toString();
}

export async function searchSpringer(query, options = {}) {
  const apiKey = options.apiKey || process.env.SPRINGER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Springer API key");
  }

  const data = await fetchJson(buildSpringerUrl(query, { ...options, apiKey }), {
    headers: {
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data.records || []).map(normalizeSpringerRecord);
}

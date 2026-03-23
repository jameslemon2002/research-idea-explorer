import { fetchJson } from "./base.js";

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeCreators(creators = []) {
  return creators
    .map((creator) => creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim())
    .filter(Boolean);
}

function normalizeTags(tags = []) {
  return tags.map((tag) => (typeof tag === "string" ? tag : tag.tag)).filter(Boolean);
}

export function normalizeZoteroItem(item) {
  const data = item.data || item;
  return {
    id: data.key || item.key || data.version || crypto.randomUUID(),
    title: data.title || data.shortTitle || data.subject || "Untitled Zotero item",
    abstract: data.abstractNote || "",
    authors: normalizeCreators(data.creators || []),
    year: extractYear(data.date),
    venue:
      data.publicationTitle ||
      data.proceedingsTitle ||
      data.repository ||
      data.websiteTitle ||
      data.blogTitle ||
      "",
    keywords: normalizeTags(data.tags || []),
    source: "zotero",
    provider: "zotero",
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi: data.DOI || null,
      zotero: data.key || item.key || null
    },
    links: {
      landingPage: item.links?.alternate?.href || null,
      pdf: null
    },
    categories: [data.itemType].filter(Boolean)
  };
}

export function buildZoteroUrl(query, options = {}) {
  const libraryType = options.libraryType || "users";
  const libraryId = options.libraryId || process.env.ZOTERO_LIBRARY_ID;
  if (!libraryId) {
    throw new Error("Missing Zotero library id");
  }

  const url = new URL(`https://api.zotero.org/${libraryType}/${libraryId}/items`);
  url.searchParams.set("q", query);
  url.searchParams.set("qmode", options.qmode || "everything");
  url.searchParams.set("limit", String(options.limit || 10));
  url.searchParams.set("format", "json");
  url.searchParams.set("include", "data");
  return url.toString();
}

export async function searchZotero(query, options = {}) {
  const apiKey = options.apiKey || process.env.ZOTERO_API_KEY;
  const items = await fetchJson(buildZoteroUrl(query, options), {
    headers: {
      "Zotero-API-Version": "3",
      ...(apiKey ? { "Zotero-API-Key": apiKey } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return items.map(normalizeZoteroItem);
}


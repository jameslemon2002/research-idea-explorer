import { fetchJson } from "./base.js";
import { buildLiteratureIndex, searchLiterature } from "../retrieval/literature.js";

function splitAuthors(authorString) {
  return String(authorString || "")
    .split(/;|,/)
    .map((author) => author.trim())
    .filter(Boolean);
}

export function normalizeBiorxivItem(item, server) {
  return {
    id: item.doi || `${server}:${item.title}`,
    title: String(item.title || "").trim(),
    abstract: String(item.abstract || "").trim(),
    authors: splitAuthors(item.authors),
    year: item.date ? Number(String(item.date).slice(0, 4)) : null,
    venue: server,
    keywords: [item.category, item.type, item.license].filter(Boolean),
    source: server,
    provider: server,
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi: item.doi || null,
      preprint: item.doi || null
    },
    links: {
      landingPage: item.doi ? `https://doi.org/${item.doi}` : null,
      pdf: item.jatsxml ? `https://www.biorxiv.org${item.jatsxml}` : null
    },
    categories: [item.category, item.type, server].filter(Boolean)
  };
}

export function buildBiorxivUrl(server, options = {}) {
  const base = `https://api.biorxiv.org/details/${server}`;
  if (options.doi) {
    return `${base}/${options.doi}/na/json`;
  }

  const interval = options.interval || "365d";
  const cursor = options.cursor || 0;
  const url = new URL(`${base}/${interval}/${cursor}/json`);
  if (options.category) {
    url.searchParams.set("category", options.category);
  }
  return url.toString();
}

export async function searchPreprintServer(server, query, options = {}) {
  const doiMatch = String(query || "").trim().match(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i);
  const data = await fetchJson(
    buildBiorxivUrl(server, {
      doi: doiMatch ? doiMatch[0] : null,
      interval: options.interval,
      cursor: options.cursor,
      category: options.category
    }),
    {
      timeoutMs: options.timeoutMs
    }
  );

  const papers = (data.collection || []).map((item) => normalizeBiorxivItem(item, server));
  const index = buildLiteratureIndex(papers, options.indexOptions || {});
  const hits = searchLiterature(index, query, {
    limit: options.limit || 10,
    strategy: options.searchStrategy || "hybrid"
  });

  return hits.map((hit) => hit.paper);
}

export async function searchBiorxiv(query, options = {}) {
  return searchPreprintServer("biorxiv", query, options);
}

export async function searchMedrxiv(query, options = {}) {
  return searchPreprintServer("medrxiv", query, options);
}


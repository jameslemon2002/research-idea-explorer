import { fetchJson } from "./base.js";

function splitAuthors(authorString) {
  return String(authorString || "")
    .split(/,|;/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function normalizeKeywordList(keywordList) {
  if (!keywordList) {
    return [];
  }

  if (Array.isArray(keywordList.keyword)) {
    return keywordList.keyword.map((keyword) => String(keyword).trim()).filter(Boolean);
  }

  if (keywordList.keyword) {
    return [String(keywordList.keyword).trim()].filter(Boolean);
  }

  return [];
}

function normalizeFullTextUrl(result) {
  const links = result.fullTextUrlList?.fullTextUrl || [];
  const normalized = Array.isArray(links) ? links : [links];
  return normalized.find((link) => String(link.documentStyle || "").toLowerCase().includes("pdf"))?.url || null;
}

export function normalizeEuropePmcResult(result) {
  const doi = result.doi || null;
  const source = result.source || "EUROPEPMC";
  const id = result.id || result.pmid || doi || result.pmcid;

  return {
    id: `${source}:${id}`,
    title: String(result.title || "").trim(),
    abstract: String(result.abstractText || "").trim(),
    authors: splitAuthors(result.authorString),
    year: result.pubYear ? Number(result.pubYear) : null,
    venue: String(result.journalTitle || result.bookOrReportDetails?.publisher || "").trim(),
    keywords: normalizeKeywordList(result.keywordList),
    source: "europepmc",
    provider: "europepmc",
    providerScore: 0,
    citationCount: result.citedByCount ? Number(result.citedByCount) : 0,
    externalIds: {
      doi,
      europepmc: id,
      pmid: result.pmid || null,
      pmcid: result.pmcid || null
    },
    links: {
      landingPage: id ? `https://europepmc.org/article/${source}/${id}` : null,
      pdf: normalizeFullTextUrl(result)
    },
    categories: [source, result.pubType].filter(Boolean)
  };
}

export function buildEuropePmcUrl(query, options = {}) {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(options.limit || 10));
  url.searchParams.set("resultType", options.resultType || "core");
  if (options.sort) {
    url.searchParams.set("sort", options.sort);
  }
  if (options.email || process.env.EUROPEPMC_EMAIL) {
    url.searchParams.set("email", options.email || process.env.EUROPEPMC_EMAIL);
  }
  return url.toString();
}

export async function searchEuropePmc(query, options = {}) {
  const data = await fetchJson(buildEuropePmcUrl(query, options), {
    headers: {
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data.resultList?.result || []).map(normalizeEuropePmcResult);
}

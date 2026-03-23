import { normalizeText } from "../schema.js";
import { searchArxiv } from "../providers/arxiv.js";
import { searchBiorxiv, searchMedrxiv } from "../providers/biorxiv.js";
import { searchCrossref } from "../providers/crossref.js";
import { searchEuropePmc } from "../providers/europepmc.js";
import { searchLocalLibrary } from "../providers/local.js";
import { searchNber } from "../providers/nber.js";
import { searchOpenAlex } from "../providers/openalex.js";
import { searchScienceDirect } from "../providers/sciencedirect.js";
import { searchSemanticScholar } from "../providers/semanticscholar.js";
import { searchSsrn } from "../providers/ssrn.js";
import { searchSpringer } from "../providers/springer.js";
import { searchWebMetadata } from "../providers/web.js";
import { searchZotero } from "../providers/zotero.js";
import { buildLiteratureIndex, searchLiterature } from "./literature.js";

const BIOMEDICAL_HINTS = [
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
  "dna"
];

const ECONOMICS_HINTS = [
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
  "unemployment"
];

function shouldUseWebProvider(query, options = {}) {
  if (options.providers?.includes("web")) {
    return true;
  }

  if (options.webUrls?.length) {
    return true;
  }

  const trimmed = String(query || "").trim();
  return /^https?:\/\//i.test(trimmed) || /^10\.\d{4,9}\//i.test(trimmed);
}

function looksBiomedical(query, options = {}) {
  const domain = String(options.domain || options.focus?.domain || "").toLowerCase();
  if (["bio", "biomedical", "biology", "medical", "medicine", "health", "clinical"].includes(domain)) {
    return true;
  }

  const normalizedQuery = normalizeText(query);
  return BIOMEDICAL_HINTS.some((hint) => normalizedQuery.includes(hint));
}

function getDefaultProviders(query, options = {}) {
  const providers = ["openalex", "crossref", "arxiv"];
  if (looksBiomedical(query, options)) {
    providers.push("europepmc", "biorxiv", "medrxiv");
  }
  if (looksEconomics(query, options)) {
    providers.push("nber");
  }
  if (shouldUseWebProvider(query, options)) {
    providers.push("web");
  }
  return [...new Set(providers)];
}

function looksEconomics(query, options = {}) {
  const domain = String(options.domain || options.focus?.domain || "").toLowerCase();
  if (["economics", "econ", "finance", "business", "management"].includes(domain)) {
    return true;
  }

  const normalizedQuery = normalizeText(query);
  return ECONOMICS_HINTS.some((hint) => normalizedQuery.includes(hint));
}

function dedupePapers(papers) {
  const seen = new Map();

  for (const paper of papers) {
    const key =
      paper.externalIds?.doi ||
      paper.id ||
      normalizeText(`${paper.title}|${(paper.authors || []).join(",")}|${paper.year || ""}`);

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        ...paper,
        providers: [paper.provider].filter(Boolean)
      });
      continue;
    }

    seen.set(key, {
      ...existing,
      abstract: existing.abstract || paper.abstract,
      venue: existing.venue || paper.venue,
      keywords: [...new Set([...(existing.keywords || []), ...(paper.keywords || [])])],
      categories: [...new Set([...(existing.categories || []), ...(paper.categories || [])])],
      providers: [...new Set([...(existing.providers || []), paper.provider].filter(Boolean))]
    });
  }

  return [...seen.values()];
}

export async function searchLiteratureSources(query, options = {}) {
  const providers = options.providers || getDefaultProviders(query, options);
  const perProviderLimit = options.perProviderLimit || 8;
  const tasks = [];

  if (providers.includes("openalex")) {
    tasks.push(
      searchOpenAlex(query, {
        limit: perProviderLimit,
        apiKey: options.openAlexApiKey,
        timeoutMs: options.timeoutMs,
        filter: options.openAlexFilter,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "openalex",
        error
      }))
    );
  }

  if (providers.includes("arxiv")) {
    tasks.push(
      searchArxiv(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        categories: options.arxivCategories,
        email: options.arxivContactEmail,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "arxiv",
        error
      }))
    );
  }

  if (providers.includes("crossref")) {
    tasks.push(
      searchCrossref(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        mailto: options.crossrefMailto,
        userAgent: options.userAgent,
        filter: options.crossrefFilter
      }).catch((error) => ({
        provider: "crossref",
        error
      }))
    );
  }

  if (providers.includes("nber")) {
    tasks.push(
      searchNber(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent,
        refUrl: options.nberRefUrl,
        includeChapters: options.nberIncludeChapters,
        searchStrategy: options.searchStrategy
      }).catch((error) => ({
        provider: "nber",
        error
      }))
    );
  }

  if (providers.includes("semanticscholar")) {
    tasks.push(
      searchSemanticScholar(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        apiKey: options.semanticScholarApiKey,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "semanticscholar",
        error
      }))
    );
  }

  if (providers.includes("ssrn")) {
    tasks.push(
      searchSsrn(query, {
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent,
        ssrnUrls: options.ssrnUrls,
        webUrls: options.webUrls
      }).catch((error) => ({
        provider: "ssrn",
        error
      }))
    );
  }

  if (providers.includes("europepmc")) {
    tasks.push(
      searchEuropePmc(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        email: options.europePmcEmail,
        userAgent: options.userAgent,
        sort: options.europePmcSort,
        resultType: options.europePmcResultType
      }).catch((error) => ({
        provider: "europepmc",
        error
      }))
    );
  }

  if (providers.includes("biorxiv")) {
    tasks.push(
      searchBiorxiv(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        interval: options.biorxivInterval,
        category: options.biorxivCategory,
        searchStrategy: options.searchStrategy
      }).catch((error) => ({
        provider: "biorxiv",
        error
      }))
    );
  }

  if (providers.includes("medrxiv")) {
    tasks.push(
      searchMedrxiv(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        interval: options.medrxivInterval,
        category: options.medrxivCategory,
        searchStrategy: options.searchStrategy
      }).catch((error) => ({
        provider: "medrxiv",
        error
      }))
    );
  }

  if (providers.includes("zotero")) {
    tasks.push(
      searchZotero(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        libraryType: options.zoteroLibraryType,
        libraryId: options.zoteroLibraryId,
        apiKey: options.zoteroApiKey
      }).catch((error) => ({
        provider: "zotero",
        error
      }))
    );
  }

  if (providers.includes("sciencedirect")) {
    tasks.push(
      searchScienceDirect(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        apiKey: options.elsevierApiKey,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "sciencedirect",
        error
      }))
    );
  }

  if (providers.includes("springer")) {
    tasks.push(
      searchSpringer(query, {
        limit: perProviderLimit,
        timeoutMs: options.timeoutMs,
        apiKey: options.springerApiKey,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "springer",
        error
      }))
    );
  }

  if (providers.includes("local")) {
    tasks.push(
      searchLocalLibrary(query, {
        limit: perProviderLimit,
        libraryPath: options.localLibraryPath,
        searchStrategy: options.searchStrategy
      })
        .then((result) => result.papers)
        .catch((error) => ({
          provider: "local",
          error
        }))
    );
  }

  if (providers.includes("web")) {
    tasks.push(
      searchWebMetadata(query, {
        webUrls: options.webUrls,
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent
      }).catch((error) => ({
        provider: "web",
        error
      }))
    );
  }

  const settled = await Promise.all(tasks);
  const errors = settled.filter((result) => !Array.isArray(result));
  const rawPapers = settled.filter(Array.isArray).flat();
  const papers = dedupePapers(rawPapers);
  const index = buildLiteratureIndex(papers, options.indexOptions || {});
  const rankedHits = searchLiterature(index, query, {
    limit: options.rankLimit || Math.min(10, papers.length || 10),
    strategy: options.searchStrategy || "hybrid"
  });

  return {
    query,
    providers,
    papers,
    errors,
    rankedHits,
    index
  };
}

export async function searchPublicLiterature(query, options = {}) {
  return searchLiteratureSources(query, options);
}

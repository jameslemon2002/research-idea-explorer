import { fetchJson } from "./base.js";

function decodeAbstractInvertedIndex(index) {
  if (!index || typeof index !== "object") {
    return "";
  }

  const positions = [];
  for (const [token, offsets] of Object.entries(index)) {
    for (const offset of offsets) {
      positions.push([offset, token]);
    }
  }

  return positions
    .sort((left, right) => left[0] - right[0])
    .map(([, token]) => token)
    .join(" ");
}

function normalizeOpenAlexWork(work) {
  const authors = (work.authorships || [])
    .map((authorship) => authorship.author?.display_name)
    .filter(Boolean);
  const keywords = [
    ...(work.keywords || []).map((keyword) => keyword.display_name).filter(Boolean),
    ...(work.topics || []).map((topic) => topic.display_name).filter(Boolean)
  ];

  return {
    id: work.id,
    title: work.display_name || work.title || "",
    abstract: decodeAbstractInvertedIndex(work.abstract_inverted_index),
    authors,
    year: work.publication_year || null,
    venue: work.primary_location?.source?.display_name || "",
    keywords,
    source: "openalex",
    provider: "openalex",
    providerScore: work.relevance_score ?? 0,
    citationCount: work.cited_by_count || 0,
    externalIds: {
      doi: work.doi || null,
      openalex: work.id || null
    },
    links: {
      landingPage: work.id || null,
      pdf: work.best_oa_location?.pdf_url || work.primary_location?.pdf_url || null
    },
    categories: (work.topics || []).map((topic) => topic.id).filter(Boolean)
  };
}

export function buildOpenAlexUrl(query, options = {}) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(options.limit || 10));
  url.searchParams.set("sort", options.sort || "relevance_score:desc");
  url.searchParams.set(
    "select",
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
      "topics"
    ].join(",")
  );

  if (options.apiKey || process.env.OPENALEX_API_KEY) {
    url.searchParams.set("api_key", options.apiKey || process.env.OPENALEX_API_KEY);
  }

  if (options.filter) {
    url.searchParams.set("filter", options.filter);
  }

  return url.toString();
}

export async function searchOpenAlex(query, options = {}) {
  const data = await fetchJson(buildOpenAlexUrl(query, options), {
    headers: {
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    },
    timeoutMs: options.timeoutMs
  });

  return (data.results || []).map(normalizeOpenAlexWork);
}

export { normalizeOpenAlexWork };


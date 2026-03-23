import { tokenize, unique } from "../schema.js";
import { fetchText } from "./base.js";
import { buildLiteratureIndex, searchLiterature } from "../retrieval/literature.js";

const DEFAULT_NBER_REF_URL = "https://data.nber.org/nber_paper_chapter_metadata/tsv/ref.tsv";

let cachedRows = null;
let cachedUrl = null;

function parseTsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitAuthors(authorString) {
  return String(authorString || "")
    .split(/\s+and\s+|;/i)
    .map((author) => author.trim())
    .filter(Boolean);
}

function extractYear(issueDate) {
  const match = String(issueDate || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferLandingPage(paperId) {
  const normalized = String(paperId || "").trim();
  if (/^[wht]\d+$/i.test(normalized)) {
    return `https://www.nber.org/papers/${normalized}`;
  }
  return null;
}

function buildNberText(row) {
  return `${row.paper || ""} ${row.author || ""} ${row.title || ""}`.trim();
}

function matchPaperId(query, row) {
  const normalized = String(query || "").trim().toLowerCase();
  const paperId = String(row.paper || "").trim().toLowerCase();
  const paperUrlMatch = normalized.match(/\/papers\/([wht]\d+)/i);
  return normalized === paperId || paperUrlMatch?.[1]?.toLowerCase() === paperId;
}

function prefilterRows(rows, query, options = {}) {
  const prefilterLimit = options.prefilterLimit || 200;
  const queryTokens = unique(tokenize(query));

  return rows
    .map((row) => {
      if (matchPaperId(query, row)) {
        return {
          row,
          score: 1
        };
      }

      const rowTokens = unique(tokenize(buildNberText(row)));
      const overlap = queryTokens.filter((token) => rowTokens.includes(token)).length;
      const score = queryTokens.length ? overlap / queryTokens.length : 0;
      return {
        row,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, prefilterLimit)
    .map((item) => item.row);
}

export function normalizeNberRow(row) {
  return {
    id: `nber:${row.paper}`,
    title: row.title || row.paper,
    abstract: "",
    authors: splitAuthors(row.author),
    year: extractYear(row.issue_date),
    venue: "NBER Working Paper",
    keywords: [],
    source: "nber",
    provider: "nber",
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi: row.doi || null,
      nber: row.paper || null
    },
    links: {
      landingPage: inferLandingPage(row.paper),
      pdf: null
    },
    categories: ["nber_working_paper"]
  };
}

async function loadNberRows(options = {}) {
  const refUrl = options.refUrl || DEFAULT_NBER_REF_URL;
  if (!options.forceRefresh && cachedRows && cachedUrl === refUrl) {
    return cachedRows;
  }

  const text = await fetchText(refUrl, {
    timeoutMs: options.timeoutMs,
    headers: {
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    }
  });

  const rows = parseTsv(text).filter((row) => options.includeChapters || /^[wht]\d+$/i.test(String(row.paper || "")));
  cachedRows = rows;
  cachedUrl = refUrl;
  return rows;
}

export async function searchNber(query, options = {}) {
  const rows = await loadNberRows(options);
  const candidates = prefilterRows(rows, query, options);
  const papers = candidates.map(normalizeNberRow);
  const index = buildLiteratureIndex(papers, {
    defaultStrategy: options.searchStrategy || "hybrid"
  });
  const hits = searchLiterature(index, query, {
    limit: options.limit || 10,
    strategy: options.searchStrategy || "hybrid"
  });

  return hits.map((hit) => hit.paper);
}

import fs from "node:fs/promises";
import path from "node:path";

import { parseBibtex } from "./local-formats.js";
import { buildLiteratureIndex, searchLiterature } from "../retrieval/literature.js";

function normalizeCreators(creators = []) {
  return creators
    .map((creator) => {
      if (typeof creator === "string") {
        return creator;
      }

      return creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);
}

function normalizeTags(tags = []) {
  if (typeof tags === "string") {
    return tags
      .split(/,|;/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return tags.map((tag) => (typeof tag === "string" ? tag : tag.tag || tag.name)).filter(Boolean);
}

function extractYear(value) {
  if (typeof value === "object" && value?.["date-parts"]?.[0]?.[0]) {
    return Number(value["date-parts"][0][0]);
  }

  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeCslAuthors(authors = []) {
  return authors
    .map((author) => author.literal || [author.given, author.family].filter(Boolean).join(" ").trim())
    .filter(Boolean);
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function chooseAuthors(item) {
  if (item.authors?.length) {
    return item.authors;
  }

  const creatorAuthors = normalizeCreators(item.creators || []);
  if (creatorAuthors.length) {
    return creatorAuthors;
  }

  return normalizeCslAuthors(item.author || []);
}

export function normalizeLocalItem(item) {
  return {
    id: item.id || item.key || item.DOI || item.title,
    title: item.title || item.display_name || "Untitled local item",
    abstract: item.abstract || item.abstractNote || item.summary || "",
    authors: chooseAuthors(item),
    year: item.year || extractYear(item.date || item.issued),
    venue:
      item.venue ||
      item.publicationTitle ||
      firstValue(item["container-title"]) ||
      item.container_title ||
      item.journal ||
      item.repository ||
      "",
    keywords: item.keywords || normalizeTags(item.tags || item.keyword || []),
    source: "local",
    provider: "local",
    providerScore: 0,
    citationCount: item.citationCount || 0,
    externalIds: {
      doi: item.DOI || item.doi || null,
      local: item.id || item.key || null
    },
    links: {
      landingPage: item.url || item.URL || null,
      pdf: item.pdf || null
    },
    categories: item.categories || [item.itemType].filter(Boolean)
  };
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readLibraryFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (absolutePath.endsWith(".bib")) {
    const raw = await fs.readFile(absolutePath, "utf8");
    return parseBibtex(raw);
  }

  const data = await readJsonFile(absolutePath);
  return Array.isArray(data) ? data : data.items || data.results || [];
}

export async function loadLocalLibrary(libraryPath) {
  if (!libraryPath) {
    throw new Error("Missing local library path");
  }

  const absolutePath = path.resolve(libraryPath);
  const stat = await fs.stat(absolutePath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(absolutePath);
    const libraryFiles = entries.filter((entry) => entry.endsWith(".json") || entry.endsWith(".bib"));
    const collections = await Promise.all(libraryFiles.map((entry) => readLibraryFile(path.join(absolutePath, entry))));
    return collections.flat();
  }

  return readLibraryFile(absolutePath);
}

export async function searchLocalLibrary(query, options = {}) {
  const items = await loadLocalLibrary(options.path || options.libraryPath);
  const papers = items.map(normalizeLocalItem);
  const index = buildLiteratureIndex(papers, options.indexOptions || {});
  const hits = searchLiterature(index, query, {
    limit: options.limit || 10,
    strategy: options.searchStrategy || "hybrid"
  });

  return {
    papers: hits.map((hit) => hit.paper),
    hits,
    index
  };
}

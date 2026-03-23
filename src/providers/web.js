import { cleanText } from "./base.js";

function parseAttributes(tag) {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = cleanText(match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function collectMetaTags(html) {
  const tags = [];
  const metaPattern = /<meta\b[^>]*>/gi;

  for (const match of html.matchAll(metaPattern)) {
    const attributes = parseAttributes(match[0]);
    const key = attributes.name || attributes.property || attributes["http-equiv"];
    const content = attributes.content;
    if (!key || !content) {
      continue;
    }

    tags.push({
      key: key.toLowerCase(),
      content
    });
  }

  return tags;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type=("|')application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = cleanText(match[2]).trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      blocks.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      continue;
    }
  }

  return blocks;
}

function pickMeta(metaMap, keys) {
  for (const key of keys) {
    if (metaMap.has(key)) {
      const values = metaMap.get(key).filter(Boolean);
      if (values.length === 1) {
        return values[0];
      }
      if (values.length > 1) {
        return values;
      }
    }
  }

  return null;
}

function buildMetaMap(tags) {
  const map = new Map();

  for (const tag of tags) {
    const values = map.get(tag.key) || [];
    values.push(tag.content);
    map.set(tag.key, values);
  }

  return map;
}

function normalizeDateYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeAuthors).filter(Boolean);
  }

  if (!value) {
    return [];
  }

  if (typeof value === "object") {
    const name = value.name || [value.givenName, value.familyName].filter(Boolean).join(" ").trim();
    return name ? [name] : [];
  }

  return [String(value)];
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeKeywords).filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstJsonLdEntity(blocks) {
  return (
    blocks.find((block) => {
      const type = Array.isArray(block?.["@type"]) ? block["@type"] : [block?.["@type"]];
      return type.filter(Boolean).some((entry) =>
        ["ScholarlyArticle", "Article", "CreativeWork", "TechArticle"].includes(entry)
      );
    }) || blocks[0] || {}
  );
}

function normalizeWebDocument({ url, finalUrl, html }) {
  const metaTags = collectMetaTags(html);
  const metaMap = buildMetaMap(metaTags);
  const jsonLd = firstJsonLdEntity(extractJsonLdBlocks(html));

  const title =
    pickMeta(metaMap, ["citation_title", "dc.title", "og:title", "twitter:title"]) ||
    jsonLd.headline ||
    jsonLd.name ||
    cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "") ||
    finalUrl;

  const abstract =
    pickMeta(metaMap, [
      "citation_abstract",
      "description",
      "dc.description",
      "og:description",
      "twitter:description"
    ]) ||
    jsonLd.description ||
    "";

  const authors = [
    ...normalizeAuthors(pickMeta(metaMap, ["citation_author", "dc.creator"])),
    ...normalizeAuthors(jsonLd.author)
  ];

  const venue =
    pickMeta(metaMap, ["citation_journal_title", "prism.publicationname", "citation_conference_title"]) ||
    jsonLd.isPartOf?.name ||
    jsonLd.publisher?.name ||
    "";

  const date =
    pickMeta(metaMap, ["citation_publication_date", "article:published_time", "dc.date"]) ||
    jsonLd.datePublished ||
    "";

  const doiRaw =
    pickMeta(metaMap, ["citation_doi", "dc.identifier", "prism.doi"]) ||
    jsonLd.identifier ||
    "";
  const doiMatch = String(Array.isArray(doiRaw) ? doiRaw[0] : doiRaw).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  const doi = doiMatch ? doiMatch[0] : null;

  const pdfUrl =
    pickMeta(metaMap, ["citation_pdf_url"]) ||
    (Array.isArray(jsonLd.encoding)
      ? jsonLd.encoding.find((item) => item?.fileFormat?.includes("pdf"))?.contentUrl
      : jsonLd.encoding?.contentUrl) ||
    null;

  return {
    id: doi || finalUrl,
    title: Array.isArray(title) ? title[0] : title,
    abstract: Array.isArray(abstract) ? abstract[0] : abstract,
    authors: [...new Set(authors.filter(Boolean))],
    year: normalizeDateYear(Array.isArray(date) ? date[0] : date),
    venue: Array.isArray(venue) ? venue[0] : venue,
    keywords: [
      ...new Set([
        ...normalizeKeywords(pickMeta(metaMap, ["citation_keywords", "keywords"])),
        ...normalizeKeywords(jsonLd.keywords)
      ])
    ],
    source: "web",
    provider: "web",
    providerScore: 0,
    citationCount: 0,
    externalIds: {
      doi,
      web: finalUrl
    },
    links: {
      landingPage: finalUrl,
      pdf: Array.isArray(pdfUrl) ? pdfUrl[0] : pdfUrl
    },
    categories: ["web_metadata"]
  };
}

function inferUrls(query, options = {}) {
  if (options.webUrls?.length) {
    return options.webUrls;
  }

  const trimmed = String(query || "").trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return [trimmed];
  }

  if (/^10\.\d{4,9}\//i.test(trimmed)) {
    return [`https://doi.org/${trimmed}`];
  }

  return [];
}

async function fetchHtmlDocument(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": options.userAgent || "research-idea-explorer/0.1 web-metadata",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15000)
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return {
    finalUrl: response.url,
    html: await response.text()
  };
}

export async function fetchWebMetadata(url, options = {}) {
  const { html, finalUrl } = await fetchHtmlDocument(url, options);
  return normalizeWebDocument({
    url,
    finalUrl,
    html
  });
}

export async function searchWebMetadata(query, options = {}) {
  const urls = inferUrls(query, options);
  if (!urls.length) {
    throw new Error("Web provider requires a URL, DOI, or explicit webUrls list");
  }

  const results = await Promise.all(urls.map((url) => fetchWebMetadata(url, options)));
  return results;
}

export { normalizeWebDocument };

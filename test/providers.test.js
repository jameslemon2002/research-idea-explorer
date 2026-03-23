import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildArxivSearchQuery, parseArxivFeed } from "../src/providers/arxiv.js";
import { normalizeBiorxivItem } from "../src/providers/biorxiv.js";
import { normalizeCrossrefItem } from "../src/providers/crossref.js";
import { normalizeEuropePmcResult } from "../src/providers/europepmc.js";
import { buildScienceDirectUrl, normalizeScienceDirectEntry } from "../src/providers/sciencedirect.js";
import { buildSemanticScholarUrl, normalizeSemanticScholarPaper } from "../src/providers/semanticscholar.js";
import { searchSsrn } from "../src/providers/ssrn.js";
import { buildSpringerUrl, normalizeSpringerRecord } from "../src/providers/springer.js";
import { normalizeLocalItem, searchLocalLibrary } from "../src/providers/local.js";
import { normalizeNberRow, searchNber } from "../src/providers/nber.js";
import { normalizeOpenAlexWork } from "../src/providers/openalex.js";
import { normalizeWebDocument, searchWebMetadata } from "../src/providers/web.js";
import { normalizeZoteroItem } from "../src/providers/zotero.js";
import { searchPublicLiterature, searchLiteratureSources } from "../src/retrieval/live.js";

test("arxiv query builder creates a fielded query without double encoding", () => {
  const query = buildArxivSearchQuery("urban heat adaptation", {
    categories: ["cs.AI", "stat.ML"]
  });

  assert.match(query, /\(all:"urban heat adaptation"\) AND/);
  assert.match(query, /cat:cs\.AI/);
});

test("arxiv atom parser extracts normalized papers", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
    <entry>
      <id>http://arxiv.org/abs/2501.12345v1</id>
      <updated>2026-01-01T00:00:00Z</updated>
      <published>2026-01-01T00:00:00Z</published>
      <title>Heat adaptation with simulation support</title>
      <summary>We study adaptive planning under extreme heat.</summary>
      <author><name>Jane Doe</name></author>
      <author><name>John Roe</name></author>
      <arxiv:doi>10.1000/test</arxiv:doi>
      <category term="cs.AI" />
      <category term="stat.ML" />
      <link href="http://arxiv.org/pdf/2501.12345v1" rel="related" title="pdf" />
    </entry>
  </feed>`;

  const papers = parseArxivFeed(xml);
  assert.equal(papers.length, 1);
  assert.equal(papers[0].authors.length, 2);
  assert.equal(papers[0].externalIds.doi, "10.1000/test");
});

test("openalex normalizer reconstructs abstract text", () => {
  const paper = normalizeOpenAlexWork({
    id: "https://openalex.org/W1",
    display_name: "Heat planning study",
    abstract_inverted_index: {
      heat: [0],
      planning: [1],
      study: [2]
    },
    publication_year: 2025,
    authorships: [
      {
        author: {
          display_name: "Alice Smith"
        }
      }
    ],
    primary_location: {
      source: {
        display_name: "Journal of Urban Data"
      }
    },
    topics: [
      {
        id: "https://openalex.org/T1",
        display_name: "Urban heat"
      }
    ],
    keywords: [
      {
        display_name: "equity"
      }
    ]
  });

  assert.equal(paper.abstract, "heat planning study");
  assert.equal(paper.keywords.includes("equity"), true);
});

test("crossref normalizer extracts doi, venue, and abstract", () => {
  const paper = normalizeCrossrefItem({
    DOI: "10.1000/crossref",
    URL: "https://doi.org/10.1000/crossref",
    title: ["Crossref indexed study"],
    abstract: "<jats:p>Structured abstract text.</jats:p>",
    author: [{ given: "Jane", family: "Doe" }],
    "container-title": ["Journal of Metadata"],
    issued: {
      "date-parts": [[2024, 5, 1]]
    },
    subject: ["metadata", "retrieval"],
    link: [{ URL: "https://example.org/paper.pdf", "content-type": "application/pdf" }]
  });

  assert.equal(paper.provider, "crossref");
  assert.equal(paper.externalIds.doi, "10.1000/crossref");
  assert.equal(paper.venue, "Journal of Metadata");
  assert.equal(paper.abstract, "Structured abstract text.");
});

test("europe pmc normalizer extracts identifiers and landing page", () => {
  const paper = normalizeEuropePmcResult({
    id: "PPR12345",
    source: "PPR",
    doi: "10.1101/2026.01.01.123456",
    title: "Single-cell atlas preprint",
    abstractText: "A biomed abstract.",
    authorString: "Jane Doe, John Roe",
    pubYear: "2026",
    journalTitle: "bioRxiv",
    citedByCount: "7",
    keywordList: {
      keyword: ["single-cell", "atlas"]
    }
  });

  assert.equal(paper.provider, "europepmc");
  assert.equal(paper.externalIds.doi, "10.1101/2026.01.01.123456");
  assert.equal(paper.links.landingPage, "https://europepmc.org/article/PPR/PPR12345");
  assert.equal(paper.citationCount, 7);
});

test("biorxiv normalizer keeps preprint metadata", () => {
  const paper = normalizeBiorxivItem(
    {
      doi: "10.1101/2026.01.01.123456",
      title: "Perturbation screen preprint",
      abstract: "A study of perturbation screens.",
      authors: "Jane Doe; John Roe",
      date: "2026-01-01",
      category: "genomics",
      type: "new results",
      license: "cc_by"
    },
    "biorxiv"
  );

  assert.equal(paper.provider, "biorxiv");
  assert.equal(paper.externalIds.doi, "10.1101/2026.01.01.123456");
  assert.deepEqual(paper.authors, ["Jane Doe", "John Roe"]);
  assert.equal(paper.year, 2026);
});

test("semantic scholar normalizer keeps paper metadata", () => {
  const paper = normalizeSemanticScholarPaper({
    paperId: "abc123",
    title: "Semantic paper",
    abstract: "An abstract.",
    authors: [{ name: "Jane Doe" }],
    year: 2025,
    venue: "Semantic Venue",
    fieldsOfStudy: ["Computer Science"],
    externalIds: {
      DOI: "10.1000/semantic"
    }
  });

  assert.equal(paper.provider, "semanticscholar");
  assert.equal(paper.externalIds.doi, "10.1000/semantic");
  assert.equal(paper.authors[0], "Jane Doe");
});

test("semantic scholar url includes query and fields", () => {
  const url = buildSemanticScholarUrl("research ideas", { limit: 7 });
  assert.match(url, /query=research\+ideas/);
  assert.match(url, /limit=7/);
  assert.match(url, /fields=/);
});

test("sciencedirect normalizer extracts DOI and venue", () => {
  const paper = normalizeScienceDirectEntry({
    "prism:doi": "10.1000/sd",
    "dc:title": "Publisher paper",
    "dc:description": "Publisher abstract",
    "dc:creator": "Jane Doe; John Roe",
    "prism:publicationName": "ScienceDirect Journal",
    "prism:coverDate": "2024-01-02"
  });

  assert.equal(paper.provider, "sciencedirect");
  assert.equal(paper.externalIds.doi, "10.1000/sd");
  assert.equal(paper.venue, "ScienceDirect Journal");
});

test("sciencedirect url uses the official search endpoint", () => {
  const url = buildScienceDirectUrl("urban adaptation", { limit: 12 });
  assert.match(url, /content\/search\/sciencedirect/);
  assert.match(url, /count=12/);
});

test("springer normalizer extracts DOI and keywords", () => {
  const paper = normalizeSpringerRecord({
    identifier: "springer-1",
    doi: "10.1000/springer",
    title: "Springer metadata record",
    abstract: "A record abstract.",
    creators: [{ creator: "Jane Doe" }],
    publicationDate: "2023-01-01",
    publicationName: "Springer Journal",
    keyword: ["metadata", "journal"]
  });

  assert.equal(paper.provider, "springer");
  assert.equal(paper.externalIds.doi, "10.1000/springer");
  assert.equal(paper.keywords.includes("metadata"), true);
});

test("springer url includes q, p, and api key", () => {
  const url = buildSpringerUrl("knowledge graph", { limit: 4, apiKey: "demo-key" });
  assert.match(url, /meta\/v2\/json/);
  assert.match(url, /q=knowledge\+graph/);
  assert.match(url, /p=4/);
  assert.match(url, /api_key=demo-key/);
});

test("nber normalizer extracts paper id and landing page", () => {
  const paper = normalizeNberRow({
    paper: "w12345",
    author: "Jane Doe and John Roe",
    title: "NBER working paper title",
    issue_date: "2024-05-01",
    doi: "10.3386/w12345"
  });

  assert.equal(paper.provider, "nber");
  assert.equal(paper.externalIds.nber, "w12345");
  assert.equal(paper.links.landingPage, "https://www.nber.org/papers/w12345");
  assert.equal(paper.year, 2024);
});

test("nber provider searches official metadata tsv", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async text() {
      return [
        "paper\tauthor\ttitle\tissue_date\tdoi",
        "w12345\tJane Doe and John Roe\tCorporate Finance under Uncertainty\t2024-05-01\t10.3386/w12345",
        "w54321\tAlice Smith\tLabor Markets and Productivity\t2023-01-01\t10.3386/w54321"
      ].join("\n");
    }
  });

  try {
    const papers = await searchNber("corporate finance", {
      forceRefresh: true,
      limit: 1,
      searchStrategy: "lexical"
    });
    assert.equal(papers.length, 1);
    assert.equal(papers[0].externalIds.nber, "w12345");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ssrn provider extracts metadata from a direct SSRN url", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456",
    async text() {
      return `
        <html>
          <head>
            <meta name="citation_title" content="SSRN working paper" />
            <meta name="citation_author" content="Jane Doe" />
            <meta name="citation_doi" content="10.2139/ssrn.123456" />
            <meta name="description" content="Working paper abstract." />
          </head>
        </html>
      `;
    }
  });

  try {
    const papers = await searchSsrn("https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456");
    assert.equal(papers.length, 1);
    assert.equal(papers[0].provider, "ssrn");
    assert.equal(papers[0].externalIds.doi, "10.2139/ssrn.123456");
  } finally {
    global.fetch = originalFetch;
  }
});

test("public literature search dedupes provider results", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);

    if (href.includes("api.openalex.org")) {
      return {
        ok: true,
        async json() {
          return {
            results: [
              {
                id: "https://openalex.org/W1",
                display_name: "Heat planning study",
                abstract_inverted_index: { heat: [0], planning: [1], study: [2] },
                publication_year: 2025,
                authorships: [{ author: { display_name: "Alice Smith" } }],
                primary_location: { source: { display_name: "Journal A" } },
                doi: "10.1000/test"
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async text() {
        return `<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
          <entry>
            <id>http://arxiv.org/abs/2501.12345v1</id>
            <published>2026-01-01T00:00:00Z</published>
            <title>Heat planning study</title>
            <summary>Heat planning study</summary>
            <author><name>Alice Smith</name></author>
            <arxiv:doi>10.1000/test</arxiv:doi>
            <category term="cs.AI" />
          </entry>
        </feed>`;
      }
    };
  };

  try {
    const result = await searchPublicLiterature("heat planning", {
      perProviderLimit: 2
    });
    assert.equal(result.papers.length, 1);
    assert.equal(result.rankedHits.length, 1);
    assert.deepEqual(result.papers[0].providers.sort(), ["arxiv", "openalex"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("live retrieval auto-enables biomedical providers for biomedical queries", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);

    if (href.includes("api.openalex.org")) {
      return {
        ok: true,
        async json() {
          return { results: [] };
        }
      };
    }

    if (href.includes("api.crossref.org")) {
      return {
        ok: true,
        async json() {
          return { message: { items: [] } };
        }
      };
    }

    if (href.includes("europepmc")) {
      return {
        ok: true,
        async json() {
          return { resultList: { result: [] } };
        }
      };
    }

    if (href.includes("api.biorxiv.org")) {
      return {
        ok: true,
        async json() {
          return { collection: [] };
        }
      };
    }

    return {
      ok: true,
      async text() {
        return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
      }
    };
  };

  try {
    const result = await searchLiteratureSources("single-cell disease pathway analysis");
    assert.equal(result.providers.includes("crossref"), true);
    assert.equal(result.providers.includes("europepmc"), true);
    assert.equal(result.providers.includes("biorxiv"), true);
    assert.equal(result.providers.includes("medrxiv"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("live retrieval auto-enables nber for economics queries", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);

    if (href.includes("api.openalex.org")) {
      return {
        ok: true,
        async json() {
          return { results: [] };
        }
      };
    }

    if (href.includes("api.crossref.org")) {
      return {
        ok: true,
        async json() {
          return { message: { items: [] } };
        }
      };
    }

    if (href.includes("data.nber.org")) {
      return {
        ok: true,
        async text() {
          return "paper\tauthor\ttitle\tissue_date\tdoi\nw12345\tJane Doe\tCorporate Finance under Uncertainty\t2024-05-01\t10.3386/w12345";
        }
      };
    }

    return {
      ok: true,
      async text() {
        return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
      }
    };
  };

  try {
    const result = await searchLiteratureSources("corporate finance productivity", {
      providers: undefined
    });
    assert.equal(result.providers.includes("nber"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("zotero normalizer converts item data into paper metadata", () => {
  const paper = normalizeZoteroItem({
    key: "ABC123",
    data: {
      key: "ABC123",
      itemType: "journalArticle",
      title: "Reasoning with documents",
      abstractNote: "A study of reasoning support.",
      creators: [
        {
          firstName: "Rong",
          lastName: "Zhao"
        }
      ],
      publicationTitle: "Journal of Reasoning",
      date: "2026-02-01",
      DOI: "10.1000/zotero"
    },
    links: {
      alternate: {
        href: "https://www.zotero.org/users/1/items/ABC123"
      }
    }
  });

  assert.equal(paper.provider, "zotero");
  assert.equal(paper.externalIds.doi, "10.1000/zotero");
  assert.equal(paper.authors[0], "Rong Zhao");
});

test("web metadata normalizer reads citation tags and json-ld", () => {
  const paper = normalizeWebDocument({
    url: "https://example.com/paper",
    finalUrl: "https://example.com/paper",
    html: `
      <html>
        <head>
          <meta name="citation_title" content="Web metadata paper" />
          <meta name="citation_author" content="Jane Smith" />
          <meta name="citation_doi" content="10.1000/webmeta" />
          <meta name="citation_journal_title" content="Metadata Journal" />
          <meta name="description" content="A paper found from page metadata." />
          <script type="application/ld+json">
            {"@type":"ScholarlyArticle","datePublished":"2024-05-01","keywords":["metadata","web"]}
          </script>
        </head>
        <body></body>
      </html>
    `
  });

  assert.equal(paper.provider, "web");
  assert.equal(paper.externalIds.doi, "10.1000/webmeta");
  assert.equal(paper.title, "Web metadata paper");
  assert.equal(paper.year, 2024);
});

test("web metadata provider fetches direct urls", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    url: "https://publisher.example/article",
    async text() {
      return `
        <html>
          <head>
            <meta property="og:title" content="Fetched metadata paper" />
            <meta name="citation_author" content="A. Researcher" />
            <meta name="dc.description" content="Fetched metadata abstract." />
          </head>
        </html>
      `;
    }
  });

  try {
    const papers = await searchWebMetadata("https://publisher.example/article");
    assert.equal(papers.length, 1);
    assert.equal(papers[0].title, "Fetched metadata paper");
  } finally {
    global.fetch = originalFetch;
  }
});

test("local provider searches exported JSON libraries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-local-"));
  const libraryPath = path.join(tempDir, "library.json");
  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Heat planning study",
        abstract: "Planning under extreme heat.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["heat", "planning"]
      },
      {
        id: "local-2",
        title: "Completely unrelated",
        abstract: "Other topic",
        authors: ["Bob Lee"],
        year: 2024
      }
    ])
  );

  const result = await searchLocalLibrary("heat planning", {
    path: libraryPath,
    limit: 1
  });

  assert.equal(result.papers.length, 1);
  assert.equal(result.papers[0].id, "local-1");
});

test("local provider reads BibTeX libraries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-bib-"));
  const libraryPath = path.join(tempDir, "library.bib");
  await fs.writeFile(
    libraryPath,
    `@article{smith2025heat,
      title={Heat planning study},
      author={Smith, Alice and Doe, Jane},
      year={2025},
      journal={Journal of Climate Planning},
      abstract={Planning under extreme heat},
      doi={10.1000/bib}
    }`
  );

  const result = await searchLocalLibrary("heat planning", {
    path: libraryPath,
    limit: 1
  });

  assert.equal(result.papers.length, 1);
  assert.equal(result.papers[0].externalIds.doi, "10.1000/bib");
  assert.deepEqual(result.papers[0].authors, ["Alice Smith", "Jane Doe"]);
});

test("local normalizer handles common CSL-JSON fields", () => {
  const paper = normalizeLocalItem({
    id: "csl-1",
    title: "CSL item",
    author: [
      {
        given: "Jane",
        family: "Doe"
      }
    ],
    issued: {
      "date-parts": [[2022, 5, 1]]
    },
    "container-title": ["Journal of CSL"],
    DOI: "10.1000/csl",
    URL: "https://example.org/csl",
    keyword: "csl-json, metadata"
  });

  assert.equal(paper.authors[0], "Jane Doe");
  assert.equal(paper.year, 2022);
  assert.equal(paper.venue, "Journal of CSL");
  assert.equal(paper.links.landingPage, "https://example.org/csl");
  assert.deepEqual(paper.keywords, ["csl-json", "metadata"]);
});

test("live retrieval accepts local provider in the unified interface", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-live-local-"));
  const libraryPath = path.join(tempDir, "library.json");
  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      normalizeLocalItem({
        id: "local-1",
        title: "Heat planning study",
        abstract: "Planning under extreme heat."
      })
    ])
  );

  const result = await searchLiteratureSources("heat planning", {
    providers: ["local"],
    localLibraryPath: libraryPath
  });

  assert.equal(result.papers.length, 1);
  assert.equal(result.papers[0].provider, "local");
});

test("live retrieval accepts web provider in the unified interface", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    url: "https://publisher.example/article",
    async text() {
      return `
        <html>
          <head>
            <meta name="citation_title" content="Web metadata paper" />
            <meta name="citation_author" content="Jane Smith" />
            <meta name="citation_doi" content="10.1000/webmeta" />
          </head>
        </html>
      `;
    }
  });

  try {
    const result = await searchLiteratureSources("https://publisher.example/article", {
      providers: ["web"]
    });
    assert.equal(result.papers.length, 1);
    assert.equal(result.papers[0].provider, "web");
  } finally {
    global.fetch = originalFetch;
  }
});

test("live retrieval accepts ssrn provider in the unified interface", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456",
    async text() {
      return `
        <html>
          <head>
            <meta name="citation_title" content="SSRN metadata paper" />
            <meta name="citation_author" content="Jane Smith" />
            <meta name="citation_doi" content="10.2139/ssrn.123456" />
          </head>
        </html>
      `;
    }
  });

  try {
    const result = await searchLiteratureSources("https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456", {
      providers: ["ssrn"]
    });
    assert.equal(result.papers.length, 1);
    assert.equal(result.papers[0].provider, "ssrn");
  } finally {
    global.fetch = originalFetch;
  }
});

# Retrieval modes

The engine is designed to support three literature retrieval modes.

## Lexical

Use title, abstract, and keyword token overlap.

- Fast
- Transparent
- Good for obvious matches
- Weak on paraphrase and indirect similarity

## Embedding

Use vector similarity over paper representations.

- Better at paraphrase and semantic similarity
- Can use sparse local vectors for development
- Can later swap in dense vectors from an embedding provider

## Graph

Use a similarity or citation graph to expand the neighborhood around good seed papers.

- Good for finding adjacent clusters instead of only nearest direct matches
- Useful for novelty estimation and frontier exploration
- Can be built from similarity edges, citation edges, or both

## Recommended strategy

Use a hybrid ranker:

1. lexical hits for precision
2. embedding hits for semantic recall
3. graph expansion for adjacent literature neighborhoods

The repository already supports all three retrieval shapes. The local implementation uses token overlap plus a lightweight sparse-vector and graph layer, and can later be upgraded to external embedding providers without changing the overall architecture.

## How To Trigger Retrieval Modes

In the CLI, set:

```bash
--search-strategy lexical
--search-strategy embedding
--search-strategy graph
--search-strategy hybrid
```

Practical mapping:

- Use `lexical` when the user wants strict keyword matching.
- Use `embedding` when the user says things like “prefer semantic similarity” or “do not rely only on keywords.”
- Use `graph` when the user says things like “expand through adjacent literature neighborhoods” or “look beyond the nearest papers.”
- Keep `hybrid` as the default when the user simply says “search literature first.”

## Live public providers

The repository also includes live provider scaffolds for:

- `OpenAlex`
- `Crossref`
- `arXiv`
- `NBER`
- `SSRN` (direct URL metadata mode)
- `Europe PMC`
- `bioRxiv`
- `medRxiv`
- `web metadata`
- `Zotero`
- `local JSON library exports`

Operational notes:

- Prefer OpenAlex for broad metadata coverage and title/abstract retrieval.
- Use Crossref as a DOI-centric metadata backbone and recall booster.
- Use arXiv for fast coverage of preprints and recent computational work.
- Use NBER when the topic is in economics, finance, or business and the user wants working-paper coverage from the official NBER metadata releases.
- Use SSRN when the user already has a business, economics, or law preprint URL and wants it pulled into the idea-generation context.
- Use Europe PMC, bioRxiv, and medRxiv when the problem space is biomedical or clinical.
- Use the web provider when the user already has a publisher URL or DOI and wants metadata extraction directly from the page.
- Use Zotero when the user already curates a personal or group library.
- Use the local provider when the library should stay on disk inside the workspace.
- Default provider routing should stay domain-aware: general queries can start with OpenAlex, Crossref, and arXiv, biomedical queries should also add Europe PMC, bioRxiv, and medRxiv, and economics/business queries should also add NBER.
- Keep arXiv requests polite and low-rate.
- Treat provider metadata as grounding for novelty checks, not as a replacement for later close reading.

## Built-in embeddings and memory

The default embedding layer is a lightweight local hash-based embedder. It is intentionally simple:

- no external model download
- deterministic
- good enough for local semantic grouping and memory-graph edges

The long-term upgrade path is to swap this out for a true dense embedding model while keeping the same retrieval and memory interfaces.

# Research Space Explorer Quick Start

[Project Home](../README.md) | [English Docs](./README.en.md) | [中文快速上手](./quickstart.zh.md)

## Get running in 5 minutes

### 1. Install

```bash
npm install
```

### 2. Generate your first round of ideas

```bash
npm run cli -- ideas --query "urban heat planning"
```

This command will:

1. search relevant literature
2. generate brainstorm seeds
3. produce research cards
4. write a JSON memory graph

### 3. Inspect the graph

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json
```

For a more visual graph:

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view network --output ./data/memory/graph.html
```

### 4. Accept a direction and continue

First list the generated ideas:

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json
```

Then accept one:

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id idea-1 --decision accepted --note "strong direction"
```

Then run `ideas` again to continue from the updated memory graph.

## Common patterns

### Specify literature sources

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### Use a local paper library

```bash
npm run cli -- ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### Prefer semantic retrieval

```bash
npm run cli -- ideas --query "urban heat planning" --search-strategy embedding
```

### Prefer neighborhood expansion

```bash
npm run cli -- ideas --query "urban heat planning" --search-strategy graph
```

## Use it in Codex

After restarting Codex, you can say:

```text
Use $research-space-explorer to generate research directions around “urban heat adaptation”.
Search relevant literature first, then give me brainstorm seeds, and finally crystallize them into four research cards.
```

## Default rules

- research-generation calls search literature first
- pure utility calls such as `graph`, `feedback`, and output-format explanation do not require retrieval
- the default retrieval mode is `hybrid`

## If you remember only one command

```bash
npm run cli -- ideas --query "your topic here"
```

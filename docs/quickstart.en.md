# Research Idea Explorer Quick Start

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
2. build a first-pass literature map
3. generate research moves and a focused frontier
4. produce research cards
5. write a JSON memory graph

If you want the deeper two-round mode:

```bash
npm run cli -- ideas --query "urban heat planning" --rounds 2
```

### 3. Inspect memory state

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json
```

To list the most recent ideas:

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view ideas
```

### 4. Accept a direction and continue

First list the generated ideas:

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json
```

Then accept one:

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

Then run `ideas` again to continue from the updated memory graph. If the memory graph already contains an `accepted` idea, the next `ideas` run automatically upgrades to two rounds unless you pass `--rounds 1`.

By default, memory continuation is topic-scoped:
- nearby topics can continue from each other
- unrelated topics in the same memory file do not cross-contaminate

If you want one shared global history instead:

```bash
npm run cli -- ideas --query "your topic here" --memory-scope global
```

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

### Force the deeper two-round search

```bash
npm run cli -- ideas --query "urban heat planning" --rounds 2
```

## Use it in Codex

After restarting Codex, you can say:

```text
Use $research-idea-explorer to generate research directions around “urban heat adaptation”.
Search literature first and give me one strong frontier. If we find a promising direction, branch again through adjacent literature.
```

## Default rules

- research-generation calls search literature first
- pure utility calls such as `graph`, `feedback`, and output-format explanation do not require retrieval
- the default retrieval mode is `hybrid`
- the default search depth is `1` round
- accepted directions automatically trigger `2` rounds on the next continuation unless you pass `--rounds 1`
- the default memory scope is `topic`

## If you remember only one command

```bash
npm run cli -- ideas --query "your topic here"
```

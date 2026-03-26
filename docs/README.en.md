# Research Idea Explorer Docs

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## Overview

`Research Idea Explorer` is a tool for research ideation and iterative direction-finding.  
It combines literature retrieval, a strong default single-pass loop, optional deeper branching, structured idea cards, critique, and memory into one workflow.

It can run as a local `CLI`, or plug into agent CLI workflows such as `Codex` and `Claude Code`.

## Good fit for

- generating grounded research directions from a topic
- avoiding shallow “method + topic” combinations
- working from an existing Zotero or local paper library
- continuing from accepted or rejected directions instead of restarting each round

## Workflow

1. retrieve public literature or load a local library
2. build a first-pass literature map and adjacent neighborhoods
3. diverge from multiple problem framings, then focus to a small frontier
4. only run a second literature-guided mutation round when the user asks for depth or continues from an accepted direction
5. filter with deduplication, overlap checks, and memory-graph signals
6. continue through accept / reject feedback

Usage principle:
except for pure utility actions such as `graph`, `feedback`, or output-format explanation, research-generation calls search literature first.

## Named capabilities

- `Scholar Scout`: literature retrieval and grounding
- `Research Moves`: default single-pass divergence with optional second-pass branching
- `Idea Forge`: compact research-card generation after the search loop
- `Crowd Guard`: duplicate and crowded-direction filtering
- `Frontier Graph`: persistent graph over queries, papers, ideas, and related links
- `Feedback Loop`: write user decisions back into memory

Memory continuation is topic-scoped by default, so unrelated topics can share one memory file without inheriting each other's accept/reject history. Use `--memory-scope global` only when you intentionally want cross-topic transfer.

## Output shape

Default research cards contain:

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

Memory graph inspection views:

- `summary`
- `ideas`
- `neighbors`

## Supported sources

- `OpenAlex`
- `Crossref`
- `arXiv`
- `Semantic Scholar`
- `NBER`
- `Europe PMC`
- `bioRxiv / medRxiv`
- `SSRN` (direct-URL metadata mode)
- `ScienceDirect` (key required)
- `Springer Nature` (key required)
- `web metadata`
- `Zotero`
- `local JSON / CSL-JSON / BibTeX`

## Start here

- [English Quick Start](./quickstart.en.md)
- [Bilingual Feature Guide](./feature-guide.zh-en.md)
- [Project Home](../README.md)

## Smallest useful command

```bash
npm install
npm run cli -- ideas --query "urban heat planning"
```

## Codex / Skill example

```text
Use $research-idea-explorer to generate research directions around “urban heat adaptation”.
Search literature first, generate one strong frontier, and only branch again through adjacent literature if we decide to deepen one direction.
```

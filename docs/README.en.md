# RQ-Explore Docs

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## Overview

`RQ-Explore` is a tool for research ideation and iterative direction-finding.  
It combines literature retrieval, persona-based brainstorming, structured idea cards, critique, and memory into one workflow.

## Good fit for

- generating grounded research directions from a topic
- avoiding shallow “method + topic” combinations
- working from an existing Zotero or local paper library
- continuing from accepted or rejected directions instead of restarting each round

## Workflow

1. retrieve public literature or load a local library
2. brainstorm from multiple personas
3. crystallize results into research cards
4. filter with deduplication, overlap checks, and memory-graph signals
5. continue through accept / reject feedback

Usage principle:
except for pure utility actions such as `graph`, `feedback`, or output-format explanation, research-generation calls search literature first.

## Named capabilities

- `Scholar Scout`: literature retrieval and grounding
- `Persona Storm`: multi-persona divergence
- `Idea Forge`: compact research-card generation
- `Crowd Guard`: duplicate and crowded-direction filtering
- `Frontier Graph`: persistent graph over queries, papers, ideas, and personas
- `Feedback Loop`: write user decisions back into memory

## Output shape

Default research cards contain:

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

Memory graph views:

- `summary`
- `ideas`
- `neighbors`
- `mermaid`
- `svg`
- `network`

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
Use $rq-explore to generate research directions around “urban heat adaptation”.
Search relevant literature first, then give me brainstorm seeds, and finally crystallize them into four research cards.
```

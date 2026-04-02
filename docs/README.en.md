# Research Idea Explorer Docs

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## Positioning

`Research Idea Explorer` is a Python research-ideation backend for `Codex CLI` and `Claude Code`.

It handles:

- literature retrieval
- literature-map construction
- divergence across multiple research moves
- structured research-card generation
- accept / reject feedback in a persistent memory graph

Most users will interact with it through `Codex` or `Claude Code`, not by manually assembling the pipeline.

## Good fit for

- generating grounded research directions from a topic
- avoiding shallow “method + topic” combinations
- continuing from an existing Zotero or local paper library
- preserving accept / reject history between rounds

## Workflow

1. retrieve public literature or load a local library
2. build a literature map and adjacent neighborhoods
3. diverge from multiple research moves, then focus to a frontier
4. filter with overlap, duplication, and memory signals
5. continue through accept / reject feedback
6. only run a second mutation round when the user asks for depth or continues from an accepted direction

Default principle:
except for pure utility calls such as `graph`, `feedback`, or output-format explanation, research-generation calls search literature first.

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

## Supported sources

- `OpenAlex`
- `Crossref`
- `arXiv`
- `Semantic Scholar`
- `NBER`
- `Europe PMC`
- `bioRxiv / medRxiv`
- `SSRN`
- `ScienceDirect`
- `Springer Nature`
- `web metadata`
- `Zotero`
- `local JSON / CSL-JSON / BibTeX`

## Installation

Recommended:

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

Alternative:

```bash
python3 -m pip install --user git+https://github.com/jameslemon2002/research-idea-explorer.git
```

Requirements:

- `Python 3.9+`
- no `Node.js`
- no `npm`

## Common commands

```bash
research-idea-explorer ideas --query "urban heat planning"
research-idea-explorer graph --memory ./data/memory/cli-memory.json
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

## Start here

- [English Quick Start](./quickstart.en.md)
- [Bilingual Feature Guide](./feature-guide.zh-en.md)
- [Dev Notes](./dev.md)
- [Changelog](../CHANGELOG.md)
- [Project Home](../README.md)

# Research Idea Explorer Feature Guide

中文在前，English follows below.

快速入口：

- [项目首页](../README.md)
- [中文快速上手](./quickstart.zh.md)
- [English Quick Start](./quickstart.en.md)

## 中文

### 这是什么

`Research Idea Explorer` 更像是一个给 `Codex CLI` 和 `Claude Code` 用的研究想题 skill / command。

它不是单次 prompt，而是一条稳定的主线：

1. 先检索文献
2. 再建立 literature map
3. 再从多个 research moves 发散
4. 再收束成结构化 research cards
5. 再通过 feedback 和 memory graph 继续推进

### 核心模块

#### 1. `Scholar Scout`

作用：
先看真实文献，再生成方向。

支持：

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

例子：

```bash
research-idea-explorer ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

```bash
research-idea-explorer ideas --query "single cell disease pathway analysis" --providers europepmc,biorxiv,medrxiv
```

```bash
research-idea-explorer ideas --query "urban heat planning" --providers local --local-library-path ./data/library.bib
```

#### 2. `Mode Switch`

作用：
控制检索更偏关键词、语义相似还是图邻域扩展。

支持模式：

- `lexical`
- `embedding`
- `graph`
- `hybrid`

例子：

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy lexical
```

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy embedding
```

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy graph
```

#### 3. `Research Moves`

作用：
不是直接拼题目，而是从多种问题结构发散。

内部会保持几条正交视角：

- `Anomaly Hunter`
- `Assumption Breaker`
- `Measurement Skeptic`
- `Failure Miner`
- `Boundary Mapper`
- `Analogy Transfer`

#### 4. `Idea Forge`

作用：
把发散结果收束成用户真正能判断的 research cards。

默认卡面：

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

#### 5. `Frontier Graph`

作用：
记录 query、paper、idea 和相邻关系，避免每轮重复探索。

默认 continuation 按 topic scope 隔离：

- 相近题目会延续
- 不同题目不会互相污染
- 只有明确想共享时才用 `--memory-scope global`

常用视图：

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view ideas
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view neighbors --idea-id <idea-id>
```

#### 6. `Feedback Loop`

作用：
让 accept / reject 进入 memory graph，影响下一轮。

例子：

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

如果同一 topic 连续被 reject，且还没有 accepted 方向，系统会自动进入 lateral reset：

- 扩大 literature map
- 优先换 contrast 或 family
- 避免只是继续缩 scope

### 安装与接入

安装：

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

接入 `Codex`：

```bash
research-idea-explorer install codex-skill
```

接入 `Claude Code`：

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

## English

### What it is

`Research Idea Explorer` is best understood as a research-ideation skill for `Codex CLI` and a command surface for `Claude Code`.

It is not a one-shot prompt. The default path is:

1. retrieve literature
2. build a literature map
3. diverge across multiple research moves
4. focus into structured research cards
5. continue through feedback and memory

### Core modules

#### 1. `Scholar Scout`

Purpose:
retrieve real literature before generating directions.

Supported sources:

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

Examples:

```bash
research-idea-explorer ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

```bash
research-idea-explorer ideas --query "single cell disease pathway analysis" --providers europepmc,biorxiv,medrxiv
```

```bash
research-idea-explorer ideas --query "urban heat planning" --providers local --local-library-path ./data/library.bib
```

#### 2. `Mode Switch`

Purpose:
control whether retrieval leans lexical, semantic, graph-based, or hybrid.

Modes:

- `lexical`
- `embedding`
- `graph`
- `hybrid`

Examples:

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy lexical
```

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy embedding
```

```bash
research-idea-explorer ideas --query "climate adaptation equity" --search-strategy graph
```

#### 3. `Research Moves`

Purpose:
explore multiple problem framings instead of producing thin topic combinations.

Internal move set:

- `Anomaly Hunter`
- `Assumption Breaker`
- `Measurement Skeptic`
- `Failure Miner`
- `Boundary Mapper`
- `Analogy Transfer`

#### 4. `Idea Forge`

Purpose:
compress loose exploration into user-facing research cards.

Default card fields:

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

#### 5. `Frontier Graph`

Purpose:
store queries, papers, ideas, and related links so later rounds do not restart from zero.

By default, continuation is topic-scoped:

- nearby topics can continue from each other
- unrelated topics do not cross-contaminate
- use `--memory-scope global` only when you explicitly want shared history

Common views:

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view ideas
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view neighbors --idea-id <idea-id>
```

#### 6. `Feedback Loop`

Purpose:
write accept / reject decisions back into the memory graph and change later continuation.

Examples:

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

If repeated rejection still has not produced an accepted direction, the system shifts into a lateral reset:

- broaden the literature map
- prefer a different contrast or idea family
- avoid solving the problem by endlessly narrowing scope

### Install and connect

Install:

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

Connect to `Codex`:

```bash
research-idea-explorer install codex-skill
```

Connect to `Claude Code`:

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

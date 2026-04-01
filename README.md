<div align="center">

# Research Idea Explorer

### 把研究想题从一次性 prompt，变成文献驱动、可记忆、可迭代的探索引擎。

*Turn research ideation into a literature-grounded, stateful exploration workflow.*

![Status](https://img.shields.io/badge/Status-Release%20Ready-0F766E)
![License](https://img.shields.io/badge/License-MIT-65A30D)
![Interface](https://img.shields.io/badge/Interface-CLI%20%2B%20Codex%20%2B%20Claude%20Code-1F2937)
![Storage](https://img.shields.io/badge/Storage-JSON%20Memory%20Graph-2563EB)
![Retrieval](https://img.shields.io/badge/Retrieval-Hybrid%20Search-F59E0B)
![Memory](https://img.shields.io/badge/Memory-Persistent%20JSON%20Graph-7C3AED)

[中文说明](docs/README.zh.md) | [English Docs](docs/README.en.md) | [快速上手](docs/quickstart.zh.md) | [Quick Start](docs/quickstart.en.md) | [功能总览 / Feature Guide](docs/feature-guide.zh-en.md) | [更新历史 / Changelog](CHANGELOG.md)

</div>

---

## 中文简介

`Research Idea Explorer` 是一个面向研究方向生成与迭代推进的工具。它把研究想题组织成一条更稳定的工作流：

1. 先检索公开文献或读取本地文献库
2. 先做一轮 literature map，找文献簇、对比轴和相邻 neighborhood
3. 再从几种彼此正交的问题结构出发做单轮发散与聚焦
4. 在用户 accept 某个方向或显式要求深挖时，再围绕它们做第二轮 literature mutation
5. 用重复检测、文献重叠、memory graph 做最终筛选
6. 让用户 accept / reject，再继续往新的 research neighborhood 推进

使用原则：
除了 `graph`、`feedback`、输出说明这类纯功能调用外，研究生成相关调用会先检索文献，再进入脑暴与排序。

更新记录：
每次大的工作流、架构或产品层更新，都会记在 [`CHANGELOG.md`](CHANGELOG.md)。

适配入口：
- `CLI`
- `Codex` skill
- `Claude Code` command

## 核心能力

- 从 `OpenAlex / Crossref / arXiv / Europe PMC / bioRxiv / medRxiv / NBER / Semantic Scholar` 等来源检索 metadata
- 读取 `Zotero`、本地 `JSON / CSL-JSON / BibTeX` 文献库
- 默认做一轮强检索 + 发散 + 聚焦，必要时升级成两轮 literature loop
- 输出精简 research cards：
  `Title / Abstract / Design / Distinctiveness / Significance`
- 用 memory graph 记住已探索方向和用户反馈，且默认按 topic scope 隔离
- 作为 Codex skill 使用：
  [`skills/research-idea-explorer/SKILL.md`](skills/research-idea-explorer/SKILL.md)
- 作为 Claude Code command 使用：
  [`.claude/commands/research-idea-explorer.md`](.claude/commands/research-idea-explorer.md)

## 功能地图

| 功能名 | 作用 |
|---|---|
| `Scholar Scout` | 文献检索与 grounding |
| `Research Moves` | 用几种正交的问题结构做默认单轮发散 |
| `Idea Forge` | 把单轮 frontier 或深挖分支收束成 research cards |
| `Crowd Guard` | 过滤换皮题、近重复和拥挤方向 |
| `Frontier Graph` | 记住已探索 neighborhood 和文献关系 |
| `Feedback Loop` | 让用户 accept / reject 后继续推进 |

## 安装与接入

### 1. 本地 CLI

这是一个 `Node.js` CLI，不是 Python 包。
在仓库根目录直接运行时，不需要 `npm install`，也不支持 `pip install`。
只要本机有 `Node.js 18+`，就可以直接运行：

```bash
node src/cli.js ideas --query "urban heat planning"
```

### 2. 给别的用户安装成全局命令

如果你想让别的用户也能像装本机 skill 一样接入，推荐先把这个项目装成全局命令。
仓库发布到 npm 后可以直接全局安装；在发布前，也可以从仓库路径或 git URL 安装。

从本地仓库安装：

```bash
npm install -g .
```

安装完成后，会得到两个命令名：
- `research-idea-explorer`
- `rie`

### 3. Codex

装成全局命令后，直接安装 Codex skill：

```bash
research-idea-explorer install codex-skill
```

然后重启 Codex，之后可以直接调用：

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
```

如果你还在仓库里本地调试，也可以直接运行：

```bash
node src/cli.js install codex-skill
```

### 4. Claude Code

装成全局命令后，把命令文件安装到目标项目：

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

之后在该项目的 Claude Code 中调用：

```text
/research-idea-explorer
```

如果想一次把 Codex 和 Claude 两个入口都装好：

```bash
research-idea-explorer install all --project /path/to/your-project
```

如果你还在仓库里本地调试，也可以直接运行：

```bash
node src/cli.js install claude-command --project /path/to/your-project
```

## 快速开始

运行 demo：

```bash
node src/demo.js
```

直接生成一轮 ideas：

```bash
node src/cli.js ideas --query "urban heat planning"
```

显式打开双轮深挖：

```bash
node src/cli.js ideas --query "urban heat planning" --rounds 2
```

指定公开文献源：

```bash
node src/cli.js ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

强调语义检索：

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy embedding
```

强调文献邻域扩展：

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy graph
```

使用本地文献库：

```bash
node src/cli.js ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

写回用户反馈：

```bash
node src/cli.js feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

下一次再跑 `ideas` 时，如果 memory 里已经有 `accepted` 方向，系统会自动升级为两轮深挖；如果你只想保持单轮，可以显式传 `--rounds 1`。

默认情况下，同一个 memory 文件里的历史会按 topic scope 隔离：
- `urban heat adaptation` 和 `urban heat planning` 这类相近题目会延续
- `urban heat adaptation` 和 `corporate finance productivity` 这类不同题目不会互相污染

如果同一 topic 下连续被 reject，且还没有形成 `accepted` 方向，系统会自动进入 lateral reset：
- 扩大 literature map，而不是只盯着同一组 top papers
- 优先换 contrast / family / evidence lane，而不是继续把 scope 越收越窄
- 自动补一轮更侧向的 mutation retrieval，试着从邻近文献簇重新开题

如果你就是想让不同题目共享同一份 history，可以显式传：

```bash
node src/cli.js ideas --query "your topic here" --memory-scope global
```

更完整的上手流程见：
- [中文快速上手](docs/quickstart.zh.md)
- [English Quick Start](docs/quickstart.en.md)

## Memory 检查

查看 memory graph 概览：

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json
```

列出最近 ideas：

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json --view ideas
```

查看某个 idea 的邻域：

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json --view neighbors --idea-id <idea-id>
```

## 支持的文献源

- `OpenAlex`
- `Crossref`
- `arXiv`
- `Semantic Scholar`
- `NBER`
- `Europe PMC`
- `bioRxiv / medRxiv`
- `SSRN`（直链 metadata 模式）
- `ScienceDirect`（需要 key）
- `Springer Nature`（需要 key）
- `web metadata`
- `Zotero`
- `local JSON / CSL-JSON / BibTeX`

## 边界与说明

已包含：

- literature-first 检索主线
- literature-guided divergence from multiple research moves
- 结构化 research cards
- 去重、反模板和拥挤区过滤
- persistent JSON memory graph
- CLI feedback 回写
- Codex skill 封装

未包含：

- 真正的外部 dense embedding 模型
- full-text RAG
- 图形化前端 UI

## 文档入口

- 中文文档：[`docs/README.zh.md`](docs/README.zh.md)
- English docs: [`docs/README.en.md`](docs/README.en.md)
- 中文快速上手：[`docs/quickstart.zh.md`](docs/quickstart.zh.md)
- English Quick Start: [`docs/quickstart.en.md`](docs/quickstart.en.md)
- 双语功能导览：[`docs/feature-guide.zh-en.md`](docs/feature-guide.zh-en.md)

---

## English Snapshot

`Research Idea Explorer` turns research ideation into a pipeline of:

1. literature retrieval
2. divergence from multiple research moves
3. structured idea-card crystallization
4. duplicate/crowding critique
5. memory-graph iteration

It already supports:

- public and local literature sources
- `lexical`, `embedding`, `graph`, and `hybrid` retrieval modes
- persistent JSON memory graph storage
- compact research cards
- CLI feedback loops
- Codex skill packaging

For full details, use:

- [English Docs](docs/README.en.md)
- [中文说明](docs/README.zh.md)
- [Feature Guide](docs/feature-guide.zh-en.md)

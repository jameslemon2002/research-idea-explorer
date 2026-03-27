# Research Idea Explorer 中文说明

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## 项目简介

`Research Idea Explorer` 是一个面向研究想题与选题推进的工具。  
它把“查文献、发散、聚焦、继续推进”放进同一条工作流里，并在需要时升级成两轮深挖，让研究生成不再依赖一次性 prompt。

它既可以直接作为本地 `CLI` 使用，也可以接到 `Codex` 或 `Claude Code` 这样的 agent CLI 工作流中。

## 适合什么场景

- 你有一个主题，想快速得到一轮有文献依据的研究方向
- 你想避免只得到“方法 + 对象”的浅层拼接
- 你已经有本地文献库，想在已有基础上继续推进
- 你想把接受/拒绝过的方向记下来，避免每轮从零开始

## 工作流

1. 检索公开文献或读取本地文献库
2. 先做一轮 literature map，找文献簇和相邻 neighborhood
3. 用几种正交的问题结构做默认单轮发散，再收束成小 frontier
4. 只有在用户要求深挖或沿 accepted 方向继续推进时，才做第二轮文献 mutation
5. 用重复检测、文献重叠和 memory graph 做最终筛选
6. 通过 accept / reject 继续探索下一轮

使用原则：
除了 `graph`、`feedback`、输出说明这类纯功能调用外，研究生成相关调用默认先检索文献。

## 核心能力

- `Scholar Scout`：文献检索与 grounding
- `Research Moves`：做默认单轮发散，并在需要时升级成 second-pass branching
- `Idea Forge`：把搜索结果收束成简洁 research cards
- `Crowd Guard`：过滤近重复和拥挤方向
- `Frontier Graph`：记录 query、paper、idea 与相关线索的关系
- `Feedback Loop`：将用户反馈回写到 memory graph

默认情况下，memory continuation 会按 topic scope 隔离，所以不同题目可以共用一个 memory 文件而不继承彼此的 accept/reject 历史。只有你明确想跨题目迁移经验时，才建议用 `--memory-scope global`。

如果某个 topic 连续被 reject，且还没有形成 accepted 方向，系统会自动切到 lateral reset：扩大文献探测范围、优先换 contrast 或 family，并降低“把 scope 缩得更小”这类本能反应。

## 输出内容

默认 research card 包含：

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

memory graph 支持这些检查视图：

- `summary`
- `ideas`
- `neighbors`

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

## 先看这里

- [中文快速上手](./quickstart.zh.md)
- [双语功能总览](./feature-guide.zh-en.md)
- [项目首页](../README.md)

## 一条最短命令

```bash
npm install
npm run cli -- ideas --query "urban heat planning"
```

## Codex / Skill 示例

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
先检索相关文献，先给我一轮强一点的 frontier；如果里面有值得继续的方向，再沿相邻文献做第二轮深挖。
```

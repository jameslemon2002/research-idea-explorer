# Research Idea Explorer 中文说明

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## 项目简介

`Research Idea Explorer` 是一个面向研究想题与选题推进的工具。  
它把“查文献、发散、收束、去重、继续推进”放进同一条工作流里，让研究生成不再依赖一次性 prompt。

它既可以直接作为本地 `CLI` 使用，也可以接到 `Codex` 或 `Claude Code` 这样的 agent CLI 工作流中。

## 适合什么场景

- 你有一个主题，想快速得到一轮有文献依据的研究方向
- 你想避免只得到“方法 + 对象”的浅层拼接
- 你已经有本地文献库，想在已有基础上继续推进
- 你想把接受/拒绝过的方向记下来，避免每轮从零开始

## 工作流

1. 检索公开文献或读取本地文献库
2. 用多 persona 做脑暴
3. 收束成 research cards
4. 用重复检测、文献重叠和 memory graph 做筛选
5. 通过 accept / reject 继续探索下一轮

使用原则：
除了 `graph`、`feedback`、输出说明这类纯功能调用外，研究生成相关调用默认先检索文献。

## 核心能力

- `Scholar Scout`：文献检索与 grounding
- `Persona Storm`：多 persona 发散脑暴
- `Idea Forge`：输出简洁 research cards
- `Crowd Guard`：过滤近重复和拥挤方向
- `Frontier Graph`：记录 query、paper、idea、persona 的关系
- `Feedback Loop`：将用户反馈回写到 memory graph

## 输出内容

默认 research card 包含：

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

memory graph 支持这些视图：

- `summary`
- `ideas`
- `neighbors`
- `mermaid`
- `svg`
- `network`

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
先检索相关文献，再给我 brainstorm seeds，最后收束成 4 张 research cards。
```

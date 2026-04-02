# Research Idea Explorer 中文说明

[![中文](https://img.shields.io/badge/说明-中文-0F766E)](./README.zh.md)
[![English](https://img.shields.io/badge/Docs-English-1F2937)](./README.en.md)

## 项目定位

`Research Idea Explorer` 的用户侧定位更接近一个研究想题 skill / command：在 `Codex CLI` 里是 skill，在 `Claude Code` 里是 command。

它负责：

- 检索文献
- 建立 literature map
- 从多种 research moves 发散
- 收束成结构化 research cards
- 记录 accept / reject 到 memory graph

用户通常只会在 `Codex` 或 `Claude Code` 里提出需求；仓库里的可安装命令只是用来支撑这两个入口。

## 适合什么场景

- 你有一个主题，想快速得到一轮有文献依据的研究方向
- 你不想只得到“方法 + 主题”的浅层拼接
- 你已经有本地文献库，想继续推进
- 你想保留 accept / reject 历史，避免每轮从零开始

## 工作流

1. 检索公开文献或读取本地文献库
2. 建立一轮 literature map 和邻近文献 neighborhood
3. 从多种 research moves 发散，再收束成 frontier
4. 用重复检测、重叠检查和 memory 信号做筛选
5. 通过 accept / reject 继续下一轮
6. 只有在要求深挖或沿 accepted 方向继续时，才做第二轮 mutation

默认原则：
除了 `graph`、`feedback`、输出格式说明这类纯工具调用外，研究生成相关请求默认先检索文献。

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
- `SSRN`
- `ScienceDirect`
- `Springer Nature`
- `web metadata`
- `Zotero`
- `local JSON / CSL-JSON / BibTeX`

## 安装方式

推荐用户安装：

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

备选：

```bash
python3 -m pip install --user git+https://github.com/jameslemon2002/research-idea-explorer.git
```

要求：

- `Python 3.9+`
- 不需要 `Node.js`
- 不需要 `npm`

## 常用命令

```bash
research-idea-explorer ideas --query "urban heat planning"
research-idea-explorer graph --memory ./data/memory/cli-memory.json
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

## 先看这里

- [中文快速上手](./quickstart.zh.md)
- [双语功能总览](./feature-guide.zh-en.md)
- [开发说明](./dev.md)
- [更新历史](../CHANGELOG.md)
- [项目首页](../README.md)

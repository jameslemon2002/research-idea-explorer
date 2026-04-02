<div align="center">

# Research Idea Explorer

### 给 `Codex CLI` 和 `Claude Code` 用的研究想题后端。

*A literature-grounded research ideation backend for Codex CLI and Claude Code.*

![Status](https://img.shields.io/badge/Status-Release%20Ready-0F766E)
![Install](https://img.shields.io/badge/Install-pipx%20or%20pip-1F2937)
![Interface](https://img.shields.io/badge/Interface-Codex%20CLI%20%2B%20Claude%20Code-2563EB)
![Storage](https://img.shields.io/badge/Memory-JSON%20Graph-F59E0B)

[中文说明](docs/README.zh.md) | [English Docs](docs/README.en.md) | [快速上手](docs/quickstart.zh.md) | [Quick Start](docs/quickstart.en.md) | [功能总览 / Feature Guide](docs/feature-guide.zh-en.md) | [开发说明 / Dev Notes](docs/dev.md) | [更新历史 / Changelog](CHANGELOG.md)

</div>

---

## 这是什么

`Research Idea Explorer` 不是一次性 prompt 模板，而是一条更稳定的研究探索工作流：

1. 先检索公开文献或读取本地文献库
2. 先做 literature map，识别文献簇和相邻 neighborhood
3. 再从多种 research moves 发散，并收束成结构化 research cards
4. 用 memory graph 记住 accept / reject 历史，避免每轮从零开始
5. 只有在用户要求深挖或沿 accepted 方向继续时，才升级成第二轮 mutation

它的定位不是“替代 Codex CLI / Claude Code”，而是做它们背后的研究想题 backend：

`用户 -> Codex CLI / Claude Code -> skill / command -> research-idea-explorer`

## 安装

推荐给最终用户的安装方式是 `pipx`：

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

如果你没有 `pipx`，也可以用：

```bash
python3 -m pip install --user git+https://github.com/jameslemon2002/research-idea-explorer.git
```

要求：

- `Python 3.9+`
- 不需要 `Node.js`
- 不需要 `npm`

安装后会得到两个命令：

- `research-idea-explorer`
- `rie`

## 接入 Codex 和 Claude Code

给 `Codex` 安装 skill：

```bash
research-idea-explorer install codex-skill
```

然后重启 Codex，之后就可以直接在提示里调用：

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
先检索相关文献，再给我一轮强一点的 frontier。
```

给 `Claude Code` 安装项目命令：

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

然后在目标项目里直接运行：

```text
/research-idea-explorer
```

如果你要一次装好两边：

```bash
research-idea-explorer install all --project /path/to/your-project
```

## 快速开始

生成第一轮 ideas：

```bash
research-idea-explorer ideas --query "urban heat planning"
```

显式打开双轮深挖：

```bash
research-idea-explorer ideas --query "urban heat planning" --rounds 2
```

指定文献源：

```bash
research-idea-explorer ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

使用本地文献库：

```bash
research-idea-explorer ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

查看 memory 概览：

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json
```

写回用户反馈：

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

默认情况下，同一个 memory 文件里的历史会按 topic scope 隔离。相近题目会延续，不相关题目不会互相污染。如果你明确想共享全局 history，再使用：

```bash
research-idea-explorer ideas --query "your topic here" --memory-scope global
```

## 核心能力

- literature-first 检索主线
- hybrid / lexical / embedding / graph 四种检索策略
- 结构化 research cards：
  `Title / Abstract / Design / Distinctiveness / Significance`
- persistent JSON memory graph
- accept / reject feedback loop
- Codex skill 与 Claude Code command 安装器

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

## 文档

- [中文说明](docs/README.zh.md)
- [English Docs](docs/README.en.md)
- [中文快速上手](docs/quickstart.zh.md)
- [English Quick Start](docs/quickstart.en.md)
- [功能总览 / Feature Guide](docs/feature-guide.zh-en.md)
- [开发说明 / Dev Notes](docs/dev.md)

## 开发者

README 主路径面向最终用户。  
如果你是在仓库里开发、调试或跑测试，请看 [docs/dev.md](docs/dev.md)。

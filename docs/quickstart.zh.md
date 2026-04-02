# Research Idea Explorer 快速上手

[项目首页](../README.md) | [中文说明](./README.zh.md) | [English Quick Start](./quickstart.en.md)

## 5 分钟上手

### 1. 安装

推荐：

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

安装后可用命令：

- `research-idea-explorer`
- `rie`

### 2. 生成第一轮 ideas

```bash
research-idea-explorer ideas --query "urban heat planning"
```

这条命令会：

1. 检索相关文献
2. 建一轮 literature map
3. 生成 research moves 和 frontier
4. 输出 research cards
5. 写入 JSON memory graph

如果你想显式打开双轮深挖：

```bash
research-idea-explorer ideas --query "urban heat planning" --rounds 2
```

### 3. 看 memory 概览

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json
```

如果你想看最近生成的 ideas：

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view ideas
```

### 4. 接受一个方向，继续推进

先列出已生成的 ideas：

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

接受其中一个：

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

然后再跑一轮 `ideas`。如果 memory 里已经有 `accepted` 方向，下一次 `ideas` 会自动升级成两轮深挖；如果你只想保持单轮，可以显式传 `--rounds 1`。

默认情况下，memory continuation 是按 topic scope 隔离的：

- 相近题目会延续同一段探索历史
- 不同题目即使共用一个 memory 文件，也不会互相污染

如果同一 topic 下连续 reject，且还没有 accept 方向，系统会自动改成 lateral reset：

- 扩大文献图谱搜索范围
- 优先换对比轴、idea family 和证据路径
- 避免只是在同一路线上不断缩 scope

如果你明确想让不同题目共享同一份 history：

```bash
research-idea-explorer ideas --query "your topic here" --memory-scope global
```

## 常见用法

### 指定文献源

```bash
research-idea-explorer ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### 使用本地文献库

```bash
research-idea-explorer ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### 强调语义检索

```bash
research-idea-explorer ideas --query "urban heat planning" --search-strategy embedding
```

### 强调邻域扩展

```bash
research-idea-explorer ideas --query "urban heat planning" --search-strategy graph
```

## 在 Codex 里使用

安装 skill：

```bash
research-idea-explorer install codex-skill
```

重启 Codex 后，可以直接说：

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
先检索相关文献，先给我一轮强一点的 frontier；如果里面有值得继续的方向，再沿相邻文献做第二轮深挖。
```

## 在 Claude Code 里使用

把命令装进目标项目：

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

之后在该项目里直接：

```text
/research-idea-explorer
```

## 如果你只记一条命令

```bash
research-idea-explorer ideas --query "your topic here"
```

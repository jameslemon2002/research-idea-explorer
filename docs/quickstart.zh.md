# Research Idea Explorer 快速上手

[项目首页](../README.md) | [中文说明](./README.zh.md) | [English Quick Start](./quickstart.en.md)

## 5 分钟上手

### 1. 准备环境

```bash
node --version
```

只需要 `Node.js 18+`。
这个仓库当前没有额外 npm 依赖，所以在仓库根目录直接运行即可，不需要 `npm install`，也不支持 `pip install`。

如果你想给别的用户或别的机器装成“全局可调用”的版本，可以先执行：

```bash
npm install -g .
```

然后用全局命令：
- `research-idea-explorer`
- `rie`

### 2. 直接生成第一轮 ideas

```bash
node src/cli.js ideas --query "urban heat planning"
```

这条命令会：

1. 检索相关文献
2. 先做一轮 literature map
3. 生成 research moves 并收束出中间 frontier
4. 输出 research cards
5. 写入 memory graph JSON

如果你想显式打开双轮深挖：

```bash
node src/cli.js ideas --query "urban heat planning" --rounds 2
```

### 3. 看 memory 概览

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json
```

如果你想看最近生成的 ideas：

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json --view ideas
```

### 4. 接受一个方向，继续推进

先列出已生成的 ideas：

```bash
node src/cli.js feedback --memory ./data/memory/cli-memory.json
```

接受其中一个：

```bash
node src/cli.js feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

然后再跑一轮 `ideas`，系统会结合已有 memory graph 继续推进。如果 memory 里已经有 `accepted` 方向，下一次 `ideas` 会自动升级成两轮深挖；如果你只想保持单轮，可以显式传 `--rounds 1`。

默认情况下，memory continuation 是按 topic scope 隔离的：
- 相近题目会延续同一段探索历史
- 不同题目即使共用一个 memory 文件，也不会互相污染

如果同一 topic 下连续 reject，且还没有 accept 方向，系统会自动改成 lateral reset：
- 扩大文献图谱搜索范围
- 优先换对比轴、idea family 和证据路径
- 避免只是在同一路线上不断缩 scope

如果你就是想让不同题目共享同一份 history，可以显式传：

```bash
node src/cli.js ideas --query "your topic here" --memory-scope global
```

## 常见用法

### 指定文献源

```bash
node src/cli.js ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### 使用本地文献库

```bash
node src/cli.js ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### 强调语义检索

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy embedding
```

### 强调邻域扩展

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy graph
```

### 显式打开双轮深挖

```bash
node src/cli.js ideas --query "urban heat planning" --rounds 2
```

## 在 Codex 里使用

Codex 这里走的是 skill，用法和本地 CLI 分开。
如果已经做了全局安装，直接执行：

```bash
research-idea-explorer install codex-skill
```

如果你还在当前仓库里本地调试，也可以执行：

```bash
node src/cli.js install codex-skill
```

重启 Codex 后，可以直接说：

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
先检索相关文献，先给我一轮强一点的 frontier；如果里面有值得继续的方向，再沿相邻文献做第二轮深挖。
```

## 在 Claude Code 里使用

如果已经做了全局安装，直接把命令装进目标项目：

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

如果你还在当前仓库里本地调试，也可以执行：

```bash
node src/cli.js install claude-command --project /path/to/your-project
```

之后在该项目里直接：

```text
/research-idea-explorer
```

## 默认规则

- 研究生成相关调用默认先检索文献
- `graph`、`feedback`、输出说明这类纯工具调用不强制检索
- 默认检索模式是 `hybrid`
- 默认搜索深度是 `1` 轮
- 如果已经 accept 过某个方向，下一次继续推进会自动升级成 `2` 轮，除非你显式传 `--rounds 1`
- 如果同一 topic 下连续 reject，系统会自动走 lateral reset，而不是只缩小 scope
- 默认 memory scope 是 `topic`

## 如果你只记一条命令

```bash
node src/cli.js ideas --query "your topic here"
```

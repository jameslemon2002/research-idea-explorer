# Research Space Explorer 快速上手

[项目首页](../README.md) | [中文说明](./README.zh.md) | [English Quick Start](./quickstart.en.md)

## 5 分钟上手

### 1. 安装

```bash
npm install
```

### 2. 直接生成第一轮 ideas

```bash
npm run cli -- ideas --query "urban heat planning"
```

这条命令会：

1. 检索相关文献
2. 生成 brainstorm seeds
3. 输出 research cards
4. 写入 memory graph JSON

### 3. 看图谱

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json
```

如果你想看更直观的关系图：

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view network --output ./data/memory/graph.html
```

### 4. 接受一个方向，继续推进

先列出已生成的 ideas：

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json
```

接受其中一个：

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id idea-1 --decision accepted --note "strong direction"
```

然后再跑一轮 `ideas`，系统会结合已有 memory graph 继续推进。

## 常见用法

### 指定文献源

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### 使用本地文献库

```bash
npm run cli -- ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### 强调语义检索

```bash
npm run cli -- ideas --query "urban heat planning" --search-strategy embedding
```

### 强调邻域扩展

```bash
npm run cli -- ideas --query "urban heat planning" --search-strategy graph
```

## 在 Codex 里使用

重启 Codex 后，可以直接说：

```text
用 $research-space-explorer 围绕 “urban heat adaptation” 生成一轮研究方向。
先检索相关文献，再给我 brainstorm seeds，最后收束成 4 张 research cards。
```

## 默认规则

- 研究生成相关调用默认先检索文献
- `graph`、`feedback`、输出说明这类纯工具调用不强制检索
- 默认检索模式是 `hybrid`

## 如果你只记一条命令

```bash
npm run cli -- ideas --query "your topic here"
```

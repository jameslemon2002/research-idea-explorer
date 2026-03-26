# Research Idea Explorer Feature Guide

中文在前，English follows below.

快速入口：
- [项目首页](../README.md)
- [中文快速上手](./quickstart.zh.md)
- [English Quick Start](./quickstart.en.md)

## 中文

### 这是什么

`Research Idea Explorer` 不是一个“帮你随便想几个题目”的 prompt 模板，而是一条更稳定的研究生成主线：

1. 先检索文献或读取用户已有文献库
2. 再用一组彼此正交的 persona 做脑暴
3. 把脑暴 seed 收束成结构化 idea cards
4. 用重复检测、文献重叠、memory graph 做筛选
5. 让用户 accept / reject，再继续往新的 research neighborhood 推进

### 主线流程

使用原则：
除了 `graph / feedback / 输出解释` 这类纯功能调用外，研究生成、继续推进、比较候选、red-team 等调用默认先检索文献，再进入脑暴和筛选。

#### 主线 A：最常用

适合“我有一个研究主题，想快速发散并落地”。

1. 用户给主题
2. 系统检索公开文献或本地文献库
3. 系统输出 brainstorm seeds
4. 系统输出 frontier idea cards
5. 用户选择保留、拒绝、继续推进

#### 主线 B：带文献约束

适合“我不想撞题，也不想脱离真实文献空间”。

1. 用户指定文献源
2. 系统做 metadata 检索
3. 系统识别 crowded areas
4. 系统沿相邻但未充分展开的方向生成 ideas
5. 用户用 feedback 更新 memory graph

#### 主线 C：带个人文献库

适合“我已经有 Zotero / BibTeX / JSON 文库”。

1. 用户提供本地库或 Zotero
2. 系统优先参考用户自己的 literature neighborhood
3. 系统避免和已有收藏高度重合
4. 用户反复 accept / reject，形成长期探索记忆

### 功能地图

#### 1. `Scholar Scout` 文献雷达

作用：
先看真实文献，再想题，避免直接空想。

支持：
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

用户可以怎么说：
- “先检索相关文献，再生成 idea。”
- “优先用 arXiv、OpenAlex、Crossref。”
- “先检索 Europe PMC、bioRxiv、medRxiv。”
- “这是经济学 / 金融 / 商科主题，先把 NBER working papers 带上。”
- “先参考我的本地 BibTeX 文库。”
- “我有一篇 SSRN 预印本链接，先把它纳入参考。”

CLI 例子：

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

```bash
npm run cli -- ideas --query "single cell disease pathway analysis" --providers europepmc,biorxiv,medrxiv
```

```bash
npm run cli -- ideas --query "urban heat planning" --providers local --local-library-path ./data/library.bib
```

```bash
npm run cli -- ideas --query "corporate finance productivity" --providers nber
```

```bash
npm run cli -- ideas --query "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456" --providers ssrn
```

#### 1.1 `Mode Switch` 检索模式切换

作用：
控制文献重排时更偏词面匹配、语义相似，还是图邻域扩展。

支持的模式：
- `lexical`：关键词/title/abstract 直接匹配
- `embedding`：基于本地 embedding 的语义相似检索
- `graph`：基于相似图的邻域扩展
- `hybrid`：综合 lexical + embedding + graph，默认模式

用户可以怎么说：
- “优先语义相似，不要只看关键词。”
- “沿相邻文献邻域扩展，不要只返回最相近论文。”
- “用 hybrid 检索，兼顾 precision 和 exploration。”

CLI 例子：

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy lexical
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy embedding
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy graph
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy hybrid
```

触发规则：
- 不显式指定时，CLI 默认走 `hybrid`
- 用户自然语言里如果强调“语义相似”“不是关键词匹配”，更适合映射到 `embedding`
- 如果强调“相邻文献群”“邻域扩展”“不要只看最近论文”，更适合映射到 `graph`
- 如果只是泛泛说“先检索文献”，通常保持 `hybrid` 最稳

#### 2. `Persona Storm` 人格脑暴

作用：
不是一句“你要有创意”，而是从不同问题结构切入。

内置 persona：
- `Anomaly Hunter`
- `Assumption Breaker`
- `Measurement Skeptic`
- `Failure Miner`
- `Boundary Mapper`
- `Analogy Transfer`

用户可以怎么说：
- “先给我 6 个来自不同 persona 的 brainstorm seeds。”
- “不要直接给标题，先做 persona 脑暴。”
- “优先反常识、失败、边界、测量扭曲。”

触发信号：
- “brainstorm”
- “不同 persona”
- “先发散再收束”

#### 3. `Idea Forge` 结构化成题

作用：
把 loose brainstorm 变成可研究的 idea card。

默认展示卡的核心字段：
- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

说明：
- 内部 schema 仍然保留 `Object / Puzzle / Claim / Contrast / Evidence / Scope / Stakes`
- 但默认用户可见卡面被压缩成上面这 5 项，减少表单感

用户可以怎么说：
- “把最强的 4 个 seed 收束成 structured idea cards。”
- “不要只给题目，要给短摘要和设计。”
- “每个 idea 都要说明它的新意和重要性。”

#### 4. `Crowd Guard` 拥挤区过滤

作用：
压掉“方法 + 主题”拼接、近重复、文献中太拥挤的方向。

用户可以怎么说：
- “不要只是 AI + X 拼接。”
- “避开高频方向。”
- “先判断 crowded areas，再生成 frontier ideas。”

触发信号：
- “avoid duplicates”
- “不要撞题”
- “不要换皮”

#### 5. `Frontier Graph` 前沿图谱

作用：
把 ideas、papers、queries、personas 放进同一 memory graph，避免每轮都从零开始。

graph 会记录：
- query
- paper
- idea
- persona
- `retrieved / generated / proposed / nearest_literature / similar_to`

用户可以怎么说：
- “不要回到我们已经访问过的方向。”
- “沿新的 research neighborhood 继续推。”
- “保留上轮 accepted 的方向，但不要只做近义改写。”

CLI 图视图：
- `summary`：整体统计
- `ideas`：最近的 idea 节点
- `neighbors`：某个 idea / node 的局部邻域

CLI 例子：

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view ideas
```

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view neighbors --idea-id idea-1
```

#### 6. `Feedback Loop` 反馈回路

作用：
让用户显式 accept / reject idea，系统之后据此继续推进。

用户可以怎么说：
- “把第 2 个 idea 视为 accepted。”
- “其余都先 reject。”
- “基于刚才接受的方向继续推。”

CLI 例子：

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json
```

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id idea-1 --decision accepted --note "strong direction"
```

### 用户怎么说，系统会触发什么

| 用户意图 | 推荐说法 | 会触发的主功能 |
|---|---|---|
| 先看文献再想题 | “先检索相关文献，再生成 idea。” | `Scholar Scout` |
| 指定 arXiv / 生医库 | “优先 arXiv” / “先检索 Europe PMC、bioRxiv、medRxiv” | `Scholar Scout` |
| 指定经管 working papers | “这是经济学/金融问题，优先 NBER。” | `Scholar Scout` |
| 强调语义相似检索 | “优先语义相似，不要只看关键词。” | `Scholar Scout` + `Mode Switch (embedding)` |
| 强调邻域扩展 | “沿相邻文献群继续扩展。” | `Scholar Scout` + `Mode Switch (graph)` |
| 先发散后收束 | “先做 brainstorm，再出 idea cards。” | `Persona Storm` + `Idea Forge` |
| 避免套路和撞题 | “不要只做方法+对象拼接，避开 crowded areas。” | `Crowd Guard` |
| 基于上轮继续 | “不要重复刚才的方向，往新 neighborhood 扩展。” | `Frontier Graph` |
| 接受/拒绝候选 | “把第 1 个 idea 当 accepted。” | `Feedback Loop` |

### 在 Codex 里怎么说

重启 Codex 后，可以这样用：

```text
用 $research-idea-explorer 围绕 “urban heat adaptation” 做一轮研究 idea 生成。
先检索相关文献，再给 6 个 brainstorm seeds，
最后收束成 4 张 structured idea cards。
```

```text
用 $research-idea-explorer。
优先用 arXiv、OpenAlex、Crossref 检索。
不要只给标题，要给 minimal design 和去重说明。
```

```text
继续用 $research-idea-explorer。
把刚才第 2 个 idea 视为 accepted，
不要回到已经访问过的方向，
请往新的 research neighborhood 推进。
```

### 在 CLI 里怎么跑

#### 公共文献源

```bash
npm run cli -- ideas --query "urban heat planning"
```

#### 明确指定 provider

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

```bash
npm run cli -- ideas --query "corporate finance productivity" --providers nber
```

#### 明确指定检索模式

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref --search-strategy embedding
```

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref --search-strategy graph
```

#### 生医方向

```bash
npm run cli -- ideas --query "single cell disease pathway analysis" --providers europepmc,biorxiv,medrxiv
```

#### 本地文献库

```bash
npm run cli -- ideas --query "urban heat planning" --providers local --local-library-path ./data/library.bib --format json
```

#### 反馈

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id idea-1 --decision accepted
```

### 推荐使用方式

最推荐的不是 UI，而是：
- `Codex skill`
- `CLI`
- `本地文献库 + memory graph`

原因：
- 这版最强的是 engine，不是界面
- 用户真正关键的是“怎么说”和“怎么迭代”
- skill 和 CLI 已经能覆盖这两件事

---

## English

### What This Project Is

`Research Idea Explorer` is not a one-shot prompt template. It is a more stable research-generation pipeline:

1. retrieve literature or load the user's own library
2. brainstorm from orthogonal personas
3. crystallize loose seeds into structured idea cards
4. filter with deduplication, literature overlap, and memory graph signals
5. let the user accept / reject directions and continue into new research neighborhoods

### Main Workflows

Usage principle:
except for pure utility actions such as `graph`, `feedback`, or output-explanation requests, generation, continuation, comparison, and red-team style calls should search literature first before brainstorming and ranking.

#### Flow A: Default

Best for “I have a topic and want fast but grounded divergence.”

1. User provides a topic
2. System retrieves public or local literature
3. System outputs brainstorm seeds
4. System outputs frontier idea cards
5. User keeps, rejects, or extends directions

#### Flow B: Literature-Constrained Generation

Best for “I do not want rediscovery and I want proximity to real literature.”

1. User specifies literature sources
2. System retrieves metadata
3. System detects crowded areas
4. System generates ideas near adjacent but underexplored regions
5. User updates the memory graph through feedback

#### Flow C: Personal Library First

Best for “I already have Zotero / BibTeX / JSON collections.”

1. User provides a local library or Zotero source
2. System prioritizes the user's own literature neighborhood
3. System avoids high overlap with the existing collection
4. User iterates with accept / reject decisions

### Feature Map

#### 1. `Scholar Scout`

Purpose:
Search literature before generating ideas.

Supports:
- `OpenAlex`
- `Crossref`
- `arXiv`
- `Semantic Scholar`
- `NBER`
- `Europe PMC`
- `bioRxiv / medRxiv`
- `SSRN` (direct-URL metadata mode)
- `ScienceDirect` (key required)
- `Springer Nature` (key required)
- `web metadata`
- `Zotero`
- `local JSON / CSL-JSON / BibTeX`

How users can ask:
- “Search relevant literature before generating ideas.”
- “Prioritize arXiv, OpenAlex, and Crossref.”
- “Search Europe PMC, bioRxiv, and medRxiv first.”
- “This is an economics, finance, or business topic. Include NBER working papers.”
- “Use my local BibTeX library first.”
- “I have an SSRN preprint URL. Include it before generating ideas.”

#### 1.1 `Mode Switch`

Purpose:
Control whether retrieval prefers exact lexical overlap, semantic similarity, or graph-neighborhood expansion.

Supported modes:
- `lexical`
- `embedding`
- `graph`
- `hybrid` (default)

How users can ask:
- “Prefer semantic similarity, not just keyword overlap.”
- “Expand through adjacent literature neighborhoods.”
- “Use hybrid retrieval.”

CLI examples:

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy lexical
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy embedding
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy graph
```

```bash
npm run cli -- ideas --query "climate adaptation equity" --search-strategy hybrid
```

Trigger rules:
- if unspecified, the CLI defaults to `hybrid`
- requests that emphasize semantic recall map best to `embedding`
- requests that emphasize neighborhood exploration or adjacent clusters map best to `graph`
- general “search literature first” requests should usually stay on `hybrid`

#### 2. `Persona Storm`

Purpose:
Drive divergence through different problem-attack styles instead of generic “be creative.”

Current personas:
- `Anomaly Hunter`
- `Assumption Breaker`
- `Measurement Skeptic`
- `Failure Miner`
- `Boundary Mapper`
- `Analogy Transfer`

How users can ask:
- “Give me six brainstorm seeds from different personas first.”
- “Do persona-based brainstorming before producing idea cards.”
- “Prioritize anomaly, failure, boundary, and measurement moves.”

#### 3. `Idea Forge`

Purpose:
Turn loose seeds into researchable idea cards.

Default card fields:
- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

Note:
- the internal schema still keeps `Object / Puzzle / Claim / Contrast / Evidence / Scope / Stakes`
- but the default user-facing card is compressed into the five fields above so it reads like a research card rather than a form

How users can ask:
- “Crystallize the strongest four seeds into structured idea cards.”
- “Do not stop at titles; include a short abstract and design.”
- “Explain each idea's distinctiveness and significance.”

#### 4. `Crowd Guard`

Purpose:
Filter shallow method-topic pairings, near-duplicates, and crowded literature directions.

How users can ask:
- “Do not give me thin method-plus-topic combinations.”
- “Avoid crowded directions.”
- “Identify crowded areas before proposing frontier ideas.”

#### 5. `Frontier Graph`

Purpose:
Keep queries, papers, ideas, and personas in one persistent graph so each round does not restart from zero.

How users can ask:
- “Do not return to directions we already explored.”
- “Push into a new research neighborhood.”
- “Keep the accepted direction but avoid near-paraphrases.”

CLI graph views:
- `summary`: overall counts
- `ideas`: recent idea nodes
- `neighbors`: the local neighborhood around an idea or node

CLI examples:

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view ideas
```

```bash
npm run cli -- graph --memory ./data/memory/cli-memory.json --view neighbors --idea-id idea-1
```

#### 6. `Feedback Loop`

Purpose:
Let the user explicitly accept or reject ideas and use that signal in later rounds.

How users can ask:
- “Treat idea 2 as accepted.”
- “Reject the others for now.”
- “Continue from the accepted direction.”

### User Intent to Feature Mapping

| User intent | Recommended wording | Main feature triggered |
|---|---|---|
| Literature first | “Search literature before generating ideas.” | `Scholar Scout` |
| Explicit sources | “Prioritize arXiv” / “Search Europe PMC, bioRxiv, medRxiv first” | `Scholar Scout` |
| Economics working papers | “This is an economics or finance topic. Include NBER working papers.” | `Scholar Scout` |
| Semantic retrieval | “Prefer semantic similarity, not just keyword overlap.” | `Scholar Scout` + `Mode Switch (embedding)` |
| Neighborhood expansion | “Expand through adjacent literature neighborhoods.” | `Scholar Scout` + `Mode Switch (graph)` |
| Diverge before structuring | “Brainstorm first, then produce idea cards.” | `Persona Storm` + `Idea Forge` |
| Avoid templates | “Avoid shallow topic-method pairings and crowded areas.” | `Crowd Guard` |
| Continue from prior rounds | “Do not repeat the previous direction; expand into a new neighborhood.” | `Frontier Graph` |
| Accept / reject directions | “Treat idea 1 as accepted.” | `Feedback Loop` |

### How To Ask in Codex

After restarting Codex, examples include:

```text
Use $research-idea-explorer to generate research ideas around “urban heat adaptation”.
Search relevant literature first, then give me six brainstorm seeds,
and finally crystallize them into four structured idea cards.
```

```text
Use $research-idea-explorer.
Prioritize arXiv, OpenAlex, and Crossref.
Do not stop at titles; include minimal design and duplicate checks.
```

```text
Continue with $research-idea-explorer.
Treat the second idea from the previous round as accepted,
do not revisit explored directions,
and extend into a new research neighborhood.
```

### How To Run It in the CLI

#### Public literature sources

```bash
npm run cli -- ideas --query "urban heat planning"
```

#### Explicit provider selection

```bash
npm run cli -- ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

#### Biomedical query

```bash
npm run cli -- ideas --query "single cell disease pathway analysis" --providers europepmc,biorxiv,medrxiv
```

#### Local library

```bash
npm run cli -- ideas --query "urban heat planning" --providers local --local-library-path ./data/library.bib --format json
```

#### Feedback

```bash
npm run cli -- feedback --memory ./data/memory/cli-memory.json --idea-id idea-1 --decision accepted
```

### Best Current Surface

Recommended user surfaces:
- `Codex skill`
- `CLI`
- `local library + memory graph`

Reason:
- the strongest part of the project is the engine, not the UI
- the most important user action is how they ask and how they iterate
- the skill and CLI already cover both well

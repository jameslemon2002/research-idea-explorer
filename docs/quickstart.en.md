# Research Idea Explorer Quick Start

[Project Home](../README.md) | [English Docs](./README.en.md) | [中文快速上手](./quickstart.zh.md)

## Get running in 5 minutes

### 1. Install

Recommended:

```bash
pipx install git+https://github.com/jameslemon2002/research-idea-explorer.git
```

Alternative:

```bash
python3 -m pip install --user git+https://github.com/jameslemon2002/research-idea-explorer.git
```

Requirements:

- `Python 3.9+`
- no `Node.js`
- no `npm`

Commands installed:

- `research-idea-explorer`
- `rie`

### 2. Generate your first round of ideas

```bash
research-idea-explorer ideas --query "urban heat planning"
```

This command will:

1. search relevant literature
2. build a literature map
3. generate research moves and a focused frontier
4. produce research cards
5. write a JSON memory graph

If you want the deeper two-round mode:

```bash
research-idea-explorer ideas --query "urban heat planning" --rounds 2
```

### 3. Inspect memory state

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json
```

To list the most recent ideas:

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view ideas
```

To inspect remembered preferences:

```bash
research-idea-explorer graph --memory ./data/memory/cli-memory.json --view preferences
```

### 4. Accept a direction and continue

First list the generated ideas:

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json
```

Then accept one:

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

If you also want to remember the conversation-level preferences from that round:

```bash
research-idea-explorer feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "prefer causal identification, avoid survey, keep policy relevance" --remember-preferences topic
```

You can also store preferences directly during generation:

```bash
research-idea-explorer ideas --query "urban heat planning" --preference-note "prefer causal identification, avoid survey, keep policy relevance" --remember-preferences topic
```

Then run `ideas` again to continue from the updated memory graph. If the memory graph already contains an `accepted` idea, or a stored topic preference profile, the next `ideas` run continues from those signals automatically unless you pass `--rounds 1`.

By default, memory continuation is topic-scoped:

- nearby topics can continue from each other
- unrelated topics in the same memory file do not cross-contaminate

If repeated rejection still has not produced an accepted direction, the system switches into a lateral reset:

- widen the literature map
- prefer a different contrast, idea family, or evidence lane
- avoid overfitting by simply shrinking scope

If you want one shared global history instead:

```bash
research-idea-explorer ideas --query "your topic here" --memory-scope global
```

## Common patterns

### Specify literature sources

```bash
research-idea-explorer ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### Use a local paper library

```bash
research-idea-explorer ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### Prefer semantic retrieval

```bash
research-idea-explorer ideas --query "urban heat planning" --search-strategy embedding
```

### Prefer neighborhood expansion

```bash
research-idea-explorer ideas --query "urban heat planning" --search-strategy graph
```

## Use it in Codex

Install the skill:

```bash
research-idea-explorer install codex-skill
```

After restarting Codex, you can say:

```text
Use $research-idea-explorer to generate research directions around “urban heat adaptation”.
Search literature first and give me one strong frontier. If we find a promising direction, branch again through adjacent literature.
```

## Use it in Claude Code

Install the project command:

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

Then inside that project, run:

```text
/research-idea-explorer
```

## If you remember only one command

```bash
research-idea-explorer ideas --query "your topic here"
```

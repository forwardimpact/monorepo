# libwiki

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Wiki lifecycle for agent teams — persistent memory, declarative integrity
audits, and a collision ledger so coordination survives across sessions and
parallel work.

<!-- END:description -->

A wiki under `wiki/` holds each agent's current state: per-agent summaries,
weekly logs, shared memory (priorities and active claims), and monthly
storyboards. `libwiki` keeps that wiki coherent across sessions. Agents boot
from it. They write decisions back. They send memos to each other. They audit
the result against a declarative rule set.

The primary interface is the `gemba-wiki` CLI. The library also exposes a few
helpers for programmatic use.

## Getting started

```sh
npx gemba-wiki init
npx gemba-wiki boot --agent staff-engineer
npx gemba-wiki audit
```

## CLI

Every command accepts `--wiki-root` (default `wiki/`) and `--today` (default
today, ISO date). Agent-scoped commands require an explicit `--agent <name>`
(`--from` for `memo`). They fail closed without it. There is no environment
fallback. The only exception is `release --expired`, a cross-agent cleanup
sweep that runs without `--agent`.

### `boot` — start a session

```sh
npx gemba-wiki boot --agent staff-engineer [--format json|markdown]
```

Print the on-boot digest for the agent: own priorities, cross-cutting
priorities, active claims, storyboard items, inbox count.

### `log` — record decisions, notes, done

```sh
npx gemba-wiki log decision --agent X --surveyed "..." --chosen "..." --rationale "..."
npx gemba-wiki log note     --agent X --field "PR Status" --body "merged"
npx gemba-wiki log done     --agent X
```

`log` appends to `wiki/<agent>-YYYY-WVV.md`. It auto-rotates to `*-partN.md`
when the entry would exceed the line budget.

### `claim` / `release` — coordinate work

```sh
npx gemba-wiki claim   --agent X --target spec-NNNN --branch claude/spec-NNNN
npx gemba-wiki release --agent X --target spec-NNNN
npx gemba-wiki release --expired
```

These commands maintain the `## Active Claims` table in `MEMORY.md`. They
refuse duplicates. An absent row means the claim is settled. `expires_at`
defaults to `claimed_at + 1 day`. A claim is a short-lived "shipping this
now" assertion. It is not a lease.

### `inbox` — triage memos

```sh
npx gemba-wiki inbox list    --agent X
npx gemba-wiki inbox ack     --agent X --index 0
npx gemba-wiki inbox promote --agent X --index 0 [--owner X]
npx gemba-wiki inbox drop    --agent X --index 0
```

`inbox` reads bullets under the `<!-- memo:inbox -->` marker in the agent's
summary. `promote` moves a bullet into the cross-cutting priorities table.

### `memo` — cross-team coordination

```sh
npx gemba-wiki memo --from X --to Y   --message "audit d642ff0c"
npx gemba-wiki memo --from X --to all --message "new XmR baseline"
```

`memo` inserts a bullet `- YYYY-MM-DD from **X**: ...` after the recipient's
`<!-- memo:inbox -->` marker.

### `audit` — verify wiki state

```sh
npx gemba-wiki audit [--format text|json]
```

`audit` runs a declarative catalogue of rules across the wiki. It exits 0 on
pass and 1 on any failure. Text output: `WARN ...` and `FAIL ...` lines plus a
`RESULT: ...` trailer. JSON output:

```json
{ "result": "pass|fail", "failures": [...], "warnings": [...] }
```

Each finding carries a stable `id` so you can filter on it. The catalogue
lives in `src/audit/rules.js`. Each new rule is one literal.

### `rotate` — force a part split

```sh
npx gemba-wiki rotate --agent X
```

`rotate` renames the current weekly log to the next `-partN.md`. It then
starts a fresh main file.

### `refresh` — re-render storyboard blocks

```sh
npx gemba-wiki refresh [storyboard-path]
```

`refresh` re-renders `<!-- xmr:metric:csv-path -->` and
`<!-- obstacles:open[:Nd] -->` marker blocks inside a storyboard from the CSV
and GitHub state behind them. Default path: `wiki/storyboard-YYYY-MMM.md` for
the current month. It also sweeps every expired row from
`MEMORY.md ## Active Claims` as part of the same deterministic refresh.

### `init` / `push` / `pull` — wiki working tree

```sh
npx gemba-wiki init [--wiki-root wiki] [--skills-dir .claude/skills]
npx gemba-wiki push
npx gemba-wiki pull
```

`init` clones the wiki repo if it is missing. It scaffolds Active Claims in
`MEMORY.md`. It creates `wiki/metrics/<skill>/` directories. `push` and
`pull` are thin wrappers over `git` that handle conflicts.

## Programmatic API

```js
import {
  writeMemo, listAgents, insertMarkers, runAudit, RULES,
} from "@forwardimpact/libwiki";
```

- `writeMemo({ summaryPath, sender, message, today })` — append a memo
  bullet after the `<!-- memo:inbox -->` marker.
- `listAgents({ agentsDir, wikiRoot })` — discover agents from
  `.claude/agents/*.md` and derive wiki summary paths.
- `insertMarkers({ agentsDir, wikiRoot })` — insert the memo marker into
  existing summaries. The call is idempotent.
- `runAudit(rules, ctx)` — pure audit engine: `(rules, ctx) → findings[]`.
- `RULES` — the audit rule catalogue (one literal per rule).

## Documentation

- [Operate a Predictable Agent Team](https://www.forwardimpact.team/docs/libraries/predictable-team/index.md)
- [Send a Memo or Update a Storyboard](https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-operations/index.md)
- [Audit and Auto-Fix the Wiki](https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-integrity/index.md)
- [Allocate Collision-Ledger Entries for Parallel Work](https://www.forwardimpact.team/docs/libraries/predictable-team/collision-ledger/index.md)

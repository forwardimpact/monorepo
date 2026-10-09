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
when the log would exceed the line budget.

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

`refresh` re-renders
`<!-- xmr:metric:csv-path [event_type=<slice>] [prior=<YYYY-MM-DD>] -->` and
`<!-- obstacles:open[:Nd] -->` marker blocks inside a storyboard from the CSV
and GitHub state behind them. Default path: `wiki/storyboard-YYYY-MMM.md` for
the current month. It also sweeps every expired row from
`MEMORY.md ## Active Claims` as part of the same deterministic refresh.

An XmR marker's tokens are the `key=value` words right after the CSV path, in
any order. The first word without `=` starts free text. `event_type=<slice>`
names the slice the block reads (`*` for all rows). A marker with no
`event_type` follows the read rule against its file: the file's sole value is
read, and a file with several values needs the token. `prior=<YYYY-MM-DD>` is
the prior-read anchor. Every render failure is a notice inside the block that
names its cause: an unknown, repeated, or unusable token, a file the wiki
cannot read, a slice the read cannot resolve, or a metric with no rows in the
resolved slice. A conflict-marker CSV still fails the refresh.

### `init` / `push` / `pull` — wiki working tree

```sh
npx gemba-wiki init [--wiki-root wiki] [--skills-dir .claude/skills]
npx gemba-wiki push
npx gemba-wiki pull
```

`init` clones the wiki repo if it is missing. It scaffolds Active Claims in
`MEMORY.md`. It creates `wiki/metrics/<skill>/` directories. `push` and
`pull` are thin wrappers over `git` that handle conflicts.

### `product-mix` — record the product-vs-internal mix

```sh
npx gemba-wiki product-mix [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--event-type <slice>]
```

`product-mix` counts the merged PRs in the window by their `product` and
`internal` labels and appends one `product_share` row through
`gemba-xmr record`. The row's slice is the caller's `--event-type`. Without
one, `record`'s own rule applies: the host workflow, else `interactive`. A
`record` failure fails the command with `record`'s message.

## Programmatic API

```js
import {
  writeMemo, listAgents, insertMarkers, runAudit, RULES,
} from "@forwardimpact/libwiki";
```

- `writeMemo({ summaryPath, sender, message, today })` — append a memo
  bullet after the `<!-- memo:inbox -->` marker.
- `listAgents({ agentsDir, wikiRoot }, fs, { warn })` — list the agent
  profiles (frontmatter `name` and `description`) in file-name order and
  derive wiki summary paths. A reference file is not on the roster, a
  `<stem>.agent.md` keys as `<stem>`, and an absent directory is empty.
  `listProjectAgents({ projectRoot, wikiRoot }, fs, { warn })` joins the
  runtime profiles directory under the project root.
- `insertMarkers({ agentsDir, wikiRoot })` — insert the memo marker into
  existing summaries. The call is idempotent.
- `runAudit(rules, ctx)` — pure audit engine: `(rules, ctx) → findings[]`.
- `RULES` — the audit rule catalogue (one literal per rule).
- `renderBlock({ metric, csvPath, projectRoot, fs, eventType, priorReadAnchor, tokenErrors })`
  — render one storyboard XmR block. It returns chart lines, or notice lines for
  every render failure except a corrupt CSV, which throws `CSVIntegrityError`.

## Documentation

- [Operate a Predictable Agent Team](https://www.gemba.team/docs/predictable-team/index.md)
- [Send a Memo or Update a Storyboard](https://www.gemba.team/docs/predictable-team/wiki-operations/index.md)
- [Audit and Auto-Fix the Wiki](https://www.gemba.team/docs/predictable-team/wiki-integrity/index.md)
- [Allocate Collision-Ledger Entries for Parallel Work](https://www.gemba.team/docs/predictable-team/collision-ledger/index.md)

## Documentation home

libwiki is an import-only library. It declares no `bin`. The `gemba-wiki`
command ships with the Gemba product, which imports these modules. Run it
with `npx gemba-wiki`.

The package publishes as `@forwardimpact/libwiki` on the Forward Impact npm
scope. Install it with `npm install @forwardimpact/libwiki`. Its task guides
live on the Gemba site at <https://www.gemba.team/>. The Forward Impact library
guide tree at <https://www.forwardimpact.team/docs/libraries/index.md> is not
this library's guide home.

**Decision (2026-08-26):** the split package scope and guide host are
deliberate. libwiki stays a Gear npm package, so `package.json .homepage`
keeps <https://www.forwardimpact.team>. The agent-memory guides moved to
gemba.team with the rest of the Gemba product. The `## Documentation` list
above carries the current URLs. Old `forwardimpact.team/docs/libraries/`
addresses forward to gemba.team.

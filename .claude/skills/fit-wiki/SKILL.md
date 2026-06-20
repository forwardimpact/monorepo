---
name: fit-wiki
description: >
  Give agent teams stable memory that persists across sessions. Use when
  an agent finishes a session and its findings would vanish without shared
  memory, when sending a memo to a teammate, when refreshing storyboard
  XmR charts, when auto-fixing wiki audit findings after editing memory,
  or when bootstrapping and syncing a wiki.
---

# Wiki Operations

`fit-wiki` is the operational CLI for the Kata agent wiki. It handles the
on-boot read set, run-time appends (decisions, notes), in-flight claims,
cross-team memos, storyboard chart maintenance, audit, auto-fix, and git
lifecycle.

## When to Use

- **Cold boot** — `npx fit-wiki boot --agent <self>` produces a JSON digest.
- **Run-time write** — `log decision` opens the entry; `log note` appends
  fields; `log done` closes.
- **In-flight work** — `claim` / `release` mark and clear `MEMORY.md ##
  Active Claims` rows.
- **Inbox triage** — `inbox list / ack / promote / drop`.
- **Cross-team memo** — `memo --to <agent> --message "..."`.
- **Storyboard refresh** — `refresh` regenerates XmR and
  obstacle/experiment marker blocks.
- **Bootstrap** — `init` clones the wiki and scaffolds Active Claims.
- **Audit** — `audit` runs the gate; replaces `scripts/wiki-audit.sh`.
- **Auto-fix** — `fix` clears `audit` findings via a Haiku technical-writer;
  run after editing memory so the Stop-hook gate passes.
- **Git lifecycle** — `push` / `pull`.

## Commands

### `boot` — On-boot digest

```sh
npx fit-wiki boot --agent staff-engineer [--format markdown]
```

| Flag | Description |
| --- | --- |
| `--agent` | Required; no environment fallback |
| `--format` | `json` (default) or `markdown` |
| `--wiki-root` | Override wiki root |

Contract: [Memory Protocol § CLI Contract Map](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#cli-contract-map)

### `log decision | note | done` — Weekly-log append

`decision` is required at the opening of each weekly-log entry. Rotation
is implicit at the 500-line cap (sealed as `…-Www-partN.md`).

```sh
npx fit-wiki log decision --agent staff-engineer --surveyed "..." --chosen "..." --rationale "..."
npx fit-wiki log note --agent staff-engineer --field "Actions taken" --body "..."
npx fit-wiki log done --agent staff-engineer
```

### `claim` / `release` — Active Claims

`claim` refuses duplicates with exit 2 and defaults `expires_at` to
`claimed_at + 1 day` — a claim is a short-lived "shipping this now" assertion,
not a lease; override with `--expires-at`. `release --expired` clears every row
past `expires_at` (so does `refresh`).

```sh
npx fit-wiki claim --agent staff-engineer --target spec-NNNN --branch feat/x [--pr NNNN] [--expires-at YYYY-MM-DD]
npx fit-wiki release --agent staff-engineer --target spec-NNNN
```

### `inbox list | ack | promote | drop`

`promote --index N` writes a row to `MEMORY.md ## Cross-Cutting Priorities`
and removes the inbox bullet.

```sh
npx fit-wiki inbox list --agent staff-engineer
npx fit-wiki inbox promote --agent staff-engineer --index 0
```

### `rotate` — Force a weekly-log rotation

Operator escape; seals the current file even when it is under the cap.

### `audit` — Memory-protocol gate

```sh
npx fit-wiki audit [--format json]
```

### `fix` — Auto-fix audit findings

```sh
npx fit-wiki fix
```

Audits, then deterministically rotates over-budget weekly logs and re-bisects
over-budget sealed parts, hands the prose-judgment findings (including inserting
a missing `### Decision`) to a Haiku technical-writer (re-auditing each round,
max three), and flags anything irreducible — a lone day-section that alone
exceeds the budget and cannot be split — for a human, exiting non-zero rather
than touching it. Run after editing wiki files.

### `memo` — Cross-team memo

```sh
npx fit-wiki memo --from staff-engineer --to security-engineer --message "audit d642ff0c"
npx fit-wiki memo --from technical-writer --to all --message "new XmR baseline"
```

| Flag | Description |
| --- | --- |
| `--from` | Falls back to `LIBEVAL_AGENT_PROFILE` |
| `--to` | Agent name, or `all` to broadcast |
| `--message` | Memo text |

### `refresh` — Regenerate storyboard charts, clear expired claims

Scans for marker pairs and regenerates each, and sweeps every expired row from
`MEMORY.md ## Active Claims`. Defaults to the current month's storyboard.
Idempotent.

```sh
npx fit-wiki refresh [storyboard-path]
```

### `init` — Bootstrap a wiki tree

Clones the wiki, scaffolds `MEMORY.md ## Active Claims`, and creates
`wiki/metrics/<skill>/`. Idempotent. Set `FIT_WIKI_URL` to override default
URL derivation.

```sh
npx fit-wiki init
```

### `push` / `pull` — Git lifecycle

Designed for Claude Code hooks (`SessionStart` → `pull`; `Stop` → `push`).

```sh
npx fit-wiki push
npx fit-wiki pull
```

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Audit failure or pull conflict |
| 2 | Usage error or duplicate claim |

### Marker contract

Storyboards carry these marker families recognized by `refresh`:

- `<!-- memo:inbox -->` — anchors `fit-wiki memo` writes
- `<!-- xmr:metric:csv-path --> ... <!-- /xmr -->` — XmR chart blocks
- `<!-- obstacles:open|closed --> ... <!-- /obstacles -->` — issue lists
- `<!-- experiments:open|closed --> ... <!-- /experiments -->` — issue lists

Closed-state markers default to a 7-day window; a `:30d` suffix is
reserved for future windows.

## Programmatic API

```js
import {
  buildDigest, parseClaims, appendClaim, removeClaim, filterExpired,
  weeklyLogPath, rotateIfOverBudget, appendEntry,
  scanMarkers, renderBlock, renderIssueList,
  writeMemo, listAgents, WikiSync, listSkills,
} from "@forwardimpact/libwiki";
```

## Documentation

- [Operate a Predictable Agent Team](https://www.forwardimpact.team/docs/libraries/predictable-team/index.md)
  — End-to-end guide to wiki memory, XmR charts, and team coordination
- [Send a Memo or Update a Storyboard](https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-operations/index.md)
  — How to use `fit-wiki` to send memos, refresh storyboards, and sync the wiki

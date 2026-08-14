---
name: gemba-wiki
description: >
  Give agent teams stable memory that persists across sessions. Use when
  an agent finishes a session and its findings would vanish without shared
  memory, when you send a memo to a teammate, when you refresh storyboard
  XmR charts, when you auto-fix wiki audit findings after you edit memory,
  or when you bootstrap and sync a wiki.
---

# Wiki Operations

`gemba-wiki` is the operational CLI for the Kata agent wiki. It handles the
on-boot read set, run-time appends (decisions, notes), in-flight claims,
cross-team memos, storyboard chart maintenance, audit, auto-fix, and git
lifecycle.

## When to Use

- **Cold boot** — `npx gemba-wiki boot --agent <self>` produces a JSON digest.
- **Run-time write** — `log decision` opens the entry. `log note` appends
  fields. `log done` closes.
- **In-flight work** — `claim` / `release` mark and clear `MEMORY.md ##
  Active Claims` rows.
- **Inbox triage** — `inbox list / ack / promote / drop`.
- **Cross-team memo** — `memo --to <agent> --message "..."`.
- **Storyboard refresh** — `refresh` regenerates XmR and
  obstacle/experiment marker blocks.
- **Bootstrap** — `init` clones the wiki and scaffolds Active Claims.
- **Audit** — `audit` runs the gate. It replaces `scripts/wiki-audit.sh`.
- **Auto-fix** — `fix` clears `audit` findings with a Haiku technical-writer.
  Run it after you edit memory so the Stop-hook gate passes.
- **Git lifecycle** — `push` / `pull`.

## Commands

### `boot` — On-boot digest

```sh
npx gemba-wiki boot --agent staff-engineer [--format markdown]
```

| Flag | Description |
| --- | --- |
| `--agent` | Required, with no environment fallback |
| `--format` | `json` (default) or `markdown` |
| `--wiki-root` | Override wiki root |

Contract:
[Memory Protocol § CLI Contract Map](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-memory-protocol.md#cli-contract-map)

### `log decision | note | done` — Weekly-log append

`decision` must open each weekly-log entry. `log` rotates the file
automatically at the 500-line cap. It seals the old file as
`…-Www-partN.md`.

```sh
npx gemba-wiki log decision --agent staff-engineer --surveyed "..." --chosen "..." --rationale "..."
npx gemba-wiki log note --agent staff-engineer --field "Actions taken" --body "..."
npx gemba-wiki log done --agent staff-engineer
```

### `claim` / `release` — Active Claims

`claim` refuses duplicates with exit 2. It defaults `expires_at` to
`claimed_at + 1 day`. A claim is a short-lived assertion that you ship now. It
is not a lease. Override the date with `--expires-at`. `release --expired`
clears every row past `expires_at`. `refresh` clears them too.

```sh
npx gemba-wiki claim --agent staff-engineer --target spec-NNNN --branch feat/x [--pr NNNN] [--expires-at YYYY-MM-DD]
npx gemba-wiki release --agent staff-engineer --target spec-NNNN
```

### `inbox list | ack | promote | drop`

`promote --index N` writes a row to `MEMORY.md ## Cross-Cutting Priorities`
and removes the inbox bullet.

```sh
npx gemba-wiki inbox list --agent staff-engineer
npx gemba-wiki inbox promote --agent staff-engineer --index 0
```

### `rotate` — Force a weekly-log rotation

This operator escape seals the current file even when it is under the cap.

### `audit` — Memory-protocol gate

```sh
npx gemba-wiki audit [--format json]
```

### `fix` — Auto-fix audit findings

```sh
npx gemba-wiki fix
```

`fix` audits first. It then rotates over-budget weekly logs deterministically.
It re-bisects over-budget sealed parts. It hands the prose-judgment findings to
a Haiku technical-writer. One such finding is a missing `### Decision` to
insert. `fix` re-audits after each round, to a maximum of three rounds. It
flags anything irreducible for a human. One example is a lone day-section that
exceeds the budget on its own and cannot be split. `fix` exits non-zero. It
does not change the flagged content. Run `fix` after you edit wiki files.

### `memo` — Cross-team memo

```sh
npx gemba-wiki memo --from staff-engineer --to security-engineer --message "audit d642ff0c"
npx gemba-wiki memo --from technical-writer --to all --message "new XmR baseline"
```

| Flag | Description |
| --- | --- |
| `--from` | Falls back to `LIBHARNESS_AGENT_PROFILE` |
| `--to` | Agent name, or `all` to broadcast |
| `--message` | Memo text |

### `refresh` — Regenerate storyboard charts, clear expired claims

`refresh` scans for marker pairs and regenerates each one. It sweeps every
expired row from `MEMORY.md ## Active Claims`. It defaults to the current
month's storyboard. `refresh` is idempotent.

```sh
npx gemba-wiki refresh [storyboard-path]
```

### `init` — Bootstrap a wiki tree

`init` clones the wiki, scaffolds `MEMORY.md ## Active Claims`, and creates
`wiki/metrics/<skill>/`. `init` is idempotent. Set `FIT_WIKI_URL` to override
how `init` derives the default URL.

```sh
npx gemba-wiki init
```

### `push` / `pull` — Git lifecycle

These commands exist for Claude Code hooks (`SessionStart` runs `pull`, `Stop`
runs `push`).

```sh
npx gemba-wiki push
npx gemba-wiki pull
```

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Audit failure or pull conflict |
| 2 | Usage error or duplicate claim |

### Marker contract

`refresh` recognizes these marker families in storyboards:

- `<!-- memo:inbox -->` — anchors `gemba-wiki memo` writes
- `<!-- xmr:metric:csv-path --> ... <!-- /xmr -->` — XmR chart blocks
- `<!-- obstacles:open|closed --> ... <!-- /obstacles -->` — issue lists
- `<!-- experiments:open|closed --> ... <!-- /experiments -->` — issue lists

Closed-state markers default to a 7-day window. A `:30d` suffix is reserved
for future windows.

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
  — How to use `gemba-wiki` to send memos, refresh storyboards, sync the wiki,
  and record the product-mix metric
- [Audit and Auto-Fix the Wiki](https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-integrity/index.md)
  — Check the wiki against the rule catalogue, auto-fix what is safe, and flag
  the rest for a human
- [Allocate Collision-Ledger Entries for Parallel Work](https://www.forwardimpact.team/docs/libraries/predictable-team/collision-ledger/index.md)
  — Assign stable, collision-free ids to parallel work and rebuild the ledger
  projections

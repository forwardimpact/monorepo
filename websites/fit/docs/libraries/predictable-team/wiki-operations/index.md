---
title: Send a Memo or Update a Storyboard
description: Communicate across your agent team and keep storyboards current. You do not manage the wiki infrastructure yourself.
---

Your agent team uses a wiki for persistent memory. The wiki holds summaries,
metrics, memos, and storyboards. You need to send a message to a teammate,
update a storyboard's charts, or make sure the wiki is in sync before a session
starts. You do not need to understand the wiki's internal structure.
`gemba-wiki` handles the plumbing.

This guide covers the two most common wiki operations: how to send a memo and
how to refresh storyboard charts. It also covers how to sync and bootstrap the
wiki for completeness. To see how the wiki serves as persistent memory for your
agent team, read the
[Persistent Memory](/docs/libraries/predictable-team/) guide.

## Prerequisites

- Node.js 22+
- A wiki already initialized in your project (see
  [Bootstrapping the wiki](#bootstrapping-the-wiki) if not)

## Sending a memo

You need to notify a teammate about something they should see on their next run.
The `memo` command appends a timestamped message to the teammate's inbox.

```sh
npx gemba-wiki memo --from technical-writer --to staff-engineer --message "check baseline"
```

```text
wrote wiki/staff-engineer.md
```

The message appears at the top of the teammate's `## Message Inbox` section as a
single markdown bullet:

```markdown
- 2026-05-04 from **technical-writer**: check baseline
```

Newest memos appear first. The command collapses a multi-line message to a
single line.

### Broadcasting to all teammates

To reach every agent except yourself:

```sh
npx gemba-wiki memo --from technical-writer --to all --message "new XmR baseline"
```

```text
wrote wiki/staff-engineer.md
wrote wiki/security-engineer.md
wrote wiki/improvement-coach.md
```

The broadcast automatically excludes the sender.

### Memo options

| Flag          | Required | Description                                                            |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `--from`      | Yes      | Sender name (no environment fallback)                                  |
| `--to`        | Yes      | Target agent name, or `all` to broadcast                               |
| `--message`   | Yes      | Message text                                                           |
| `--wiki-root` | No       | Override wiki root directory (default: auto-detected from project root) |

If you omit `--from`, the command exits with an error before it writes
anything.

### The marker contract

Each agent summary file must contain a `<!-- memo:inbox -->` HTML comment
directly under the `## Message Inbox` heading:

```markdown
## Message Inbox

<!-- memo:inbox -->

- 2026-05-04 from **technical-writer**: check baseline
```

The marker is invisible in rendered markdown. If it is missing, the command
exits with code 2 and a diagnostic message. Wiki initialization places the
marker once. Do not remove it.

## Refreshing storyboard charts

Your storyboard contains XmR chart blocks that visualize metrics over time. When
new metric rows land in the CSV files, you must regenerate the charts. The
`refresh` command does that in place.

```sh
npx gemba-wiki refresh
```

Without a path argument, the command targets the current month's storyboard at
`wiki/storyboard-YYYY-MNN.md`. To refresh a specific file:

```sh
npx gemba-wiki refresh wiki/storyboard-2026-M05.md
```

The command scans the file for marker pairs like this:

```markdown
<!-- xmr:findings:wiki/metrics/kata-spec/2026.csv -->
(chart content regenerated here)
<!-- /xmr -->
```

The command replaces each block with the current XmR chart from the referenced
CSV. It adds a `**Signals:**` line that names any fired rules (`xRule1`,
`mrRule1`, ...). When the metric has fewer than 15 points, the block carries an
"Insufficient data" line instead. The command leaves files without markers
unchanged. The operation is idempotent. Two runs produce the same output.

`refresh` also sweeps expired rows from `MEMORY.md`'s `## Active Claims` table
in the same pass. A stale claim then no longer gives a false signal of work in
flight. A claim expires one day after you make it by default. The table then
holds only genuinely active work.

## Recording the product-mix metric

Your team tracks how much of its merged work is product-facing versus internal.
The `product-mix` command computes that share directly from merged pull
requests. It records the share as a metric that the XmR pipeline can chart.

```sh
npx gemba-wiki product-mix
```

The command looks at pull requests merged into `main` in a rolling window. The
window is the last seven days by default. It counts each pull request by its
`product` or `internal` label. It then appends a `product_share` row to
`wiki/metrics/product-mix/<YYYY>.csv`. The value is the percentage of labeled
PRs that carry the `product` label:

```text
product_share = round(product / (product + internal) * 100)
```

To analyze a specific window, pass the bounds:

```sh
npx gemba-wiki product-mix --since 2026-06-01 --until 2026-06-27
```

The command is deterministic. Two runs over the same merged PRs produce the
same value. A window with no labeled merged PRs records no row. This avoids a
meaningless zero-over-zero ratio. The recorded row flows into the same
analysis path as every other metric. To turn it into a control chart, read
[Chart a Metric and Check Variation](/docs/libraries/predictable-team/xmr-analysis/).

| Flag      | Required | Description                                              |
| --------- | -------- | ------------------------------------------------------- |
| `--since` | No       | Window start ISO date (default: `--until` minus 7 days).|
| `--until` | No       | Window end ISO date (default: today).                   |
| `--run`   | No       | Run id recorded on the metric row (default: `gh-live`). |
| `--repo`  | No       | `owner/repo` slug (default: the `origin` remote).       |

## Syncing wiki state

The wiki is a separate git repository cloned into `wiki/` within your project.
Two commands keep it synchronized:

```sh
npx gemba-wiki pull
```

```text
pull: up to date
```

```sh
npx gemba-wiki push
```

```text
push: committed and pushed
```

`push` is a no-op when no local changes exist. Local state wins on conflicts in
the markdown surfaces: summaries, memos, and the storyboard. Metrics CSVs are
the one exception. They merge and keep both sides (see
[Concurrent metrics appends](#concurrent-metrics-appends) below). `pull` exits
non-zero with a diagnostic when it detects a conflict.

Use both commands in Claude Code hooks (e.g., `pull` in SessionStart, `push` in
Stop) and in GitHub Actions post-run steps.

### Concurrent metrics appends

Two sessions often append metric rows to the same `metrics/**/*.csv` file at
once. For these files the sync keeps the rows from both sides. The last writer
does not win. A concurrent append never erases another session's row.

A tracked `.gitattributes` line in the wiki carries this behavior:

```text
metrics/**/*.csv merge=union
```

Because the file is tracked, the rule governs every clone. Fresh wikis get it at
`init`. Existing wikis get it on their next sync. Protection begins the sync
after the line lands.

When the sync keeps both sides, it can leave an identical row twice. The sync
never removes a duplicate on its own. Instead, `gemba-wiki audit` reports a
`metrics-csv.duplicate-row` finding that names the file and the line. The row's
owner then resolves it one of two ways:

- Delete the surplus row if it is an accidental repeat.
- Edit any column (a run id or a note) if the rows are genuinely distinct
  measurements. The edit makes the rows differ. The finding no longer fires.

## Secret scanning in wiki pushes

Your wiki is public the moment it pushes. A GitHub Wiki repository cannot run
GitHub Actions or GitHub secret-scanning. So the push path is the only place a
secret-leak control can live. Every command that pushes the wiki (`claim`,
`release`, `push`) runs a fail-closed secret scan. The scan covers the content
the push introduces. It runs before any network contact.

When the scan finds a secret, the command stops. It does not push. It does not
fall back to "saved locally". It exits non-zero with the finding location:

```text
push blocked: secret detected in wiki content (MEMORY.md:42:github-pat); the push was not attempted.
```

A network or credential failure is different. That still degrades to "saved
locally" and succeeds. The change is on disk. A later push retries it. Only a
detected secret or a missing scanner blocks the command.

### Provisioning the scanner

The scan uses [gitleaks](https://github.com/gitleaks/gitleaks). Install it on
the machine that runs `gemba-wiki` and make it resolvable on `PATH`. Pin the
same version the repository's CI standardises on:

```sh
gitleaks version   # expect 8.24.3
```

If gitleaks is not available, the push fails closed. It does not skip the scan:

```text
push blocked: the secret scanner (gitleaks) is unavailable; the push was not attempted.
```

A detective control that silently disables itself is not a control. So the
command treats a missing scanner as a refusal. It never treats a missing
scanner as a pass.

### Break-glass overrides

Two off-by-default overrides let an operator proceed past a confirmed false
positive or an unavoidable missing scanner. Each override is a separate
environment variable. So the override for a routine false positive can never
silently bypass a later missing-scanner refusal. Each override must carry a
reason. Either override writes a durable audit line when you use it.

| Override | Permits | Set it to |
| --- | --- | --- |
| `FIT_WIKI_SECRET_OVERRIDE` | A detected finding | The reason for the override |
| `FIT_WIKI_SCANNER_ABSENT_OK` | A missing scanner | The reason for the override |

```sh
FIT_WIKI_SECRET_OVERRIDE="example token in MEMORY.md is a documented sample" npx gemba-wiki push
```

Each override appends one line to `secret-overrides.log` in the wiki tree. The
same push commits that line. The line records the timestamp, the operator
identity, the override class, and the reason. For a finding, it also records
the location (`file:line:rule`). It never records the matched secret value.

The recorded identity comes from `git config user.email`. It is a self-asserted
attribution of intent. It is not an authenticated identity. Treat the log as a
record of who claimed responsibility. It is not cryptographic proof.

## Bootstrapping the wiki

If your project does not have a wiki yet, `init` sets one up:

```sh
npx gemba-wiki init
```

```text
init: wiki ready at wiki
```

The command clones the repository's wiki into `wiki/`. It creates a
`wiki/metrics/<skill>/` directory for each skill under `.claude/skills/`. Set
`FIT_WIKI_URL` to override the wiki URL when the default derivation from
`origin` does not resolve.

The command is idempotent. It is safe to run on an already-initialized wiki. It
authenticates with `GH_TOKEN` or `GITHUB_TOKEN` from the environment, or with a
logged-in `gh` CLI.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-integrity -->
<!-- part:card:../collision-ledger -->
<!-- part:card:../xmr-analysis -->

</div>

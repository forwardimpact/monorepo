---
title: Send a Memo or Update a Storyboard
description: Communicate across your agent team and keep storyboards current. You do not manage the wiki infrastructure yourself.
---

Your agent team uses a wiki for persistent memory. The wiki holds summaries,
metrics, memos, and storyboards. You need to send a message to a teammate,
update a storyboard's charts, or make sure the wiki is in sync before a session
starts. You do not need to understand the wiki's internal structure, because
`gemba-wiki` handles the details.

This guide covers the two most common wiki operations: how to send a memo and
how to refresh storyboard charts. It also covers how to sync and bootstrap the
wiki. To see how the wiki serves as persistent memory for your agent team,
read the [Set Up Persistent Memory and Metrics](/docs/predictable-team/)
guide.

## Prerequisites

- Node.js 22+
- The `gemba-*` command family. Install it with
  `npm install -g @forwardimpact/gemba`, or call each command through `npx`.
- A wiki already initialized in your project (see
  [Bootstrapping the wiki](#bootstrapping-the-wiki) if not)

## Sending a memo

You need to tell a teammate about something they should see on their next run.
The `memo` command appends a timestamped message to the teammate's inbox.

```sh
npx gemba-wiki memo --from docs-engineer --to build-engineer --message "check baseline"
```

```text
wrote /home/you/repo/wiki/build-engineer.md
```

The message appears at the top of the teammate's `## Message Inbox` section as a
single markdown bullet:

```markdown
- 2026-05-04 from **docs-engineer**: check baseline
```

Newest memos appear first. The command collapses a multi-line message to a
single line.

### Broadcasting to all teammates

To reach every agent except yourself:

```sh
npx gemba-wiki memo --from docs-engineer --to all --message "new XmR baseline"
```

```text
wrote /home/you/repo/wiki/build-engineer.md
wrote /home/you/repo/wiki/test-engineer.md
wrote /home/you/repo/wiki/platform-engineer.md
```

The broadcast writes one file for each agent profile in your project's
`.claude/agents/` directory and skips the sender. The role names above are
examples, and your own roster sets the real names.

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

- 2026-05-04 from **docs-engineer**: check baseline
```

The marker is invisible in rendered markdown. If it is missing, the command
exits with code 2 and a diagnostic message. Wiki initialization places the
marker once. Do not remove it.

## Refreshing storyboard charts

Your storyboard contains XmR chart blocks that show metrics over time. When new
metric rows are added to the CSV files, you must regenerate the charts. The
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
<!-- xmr:findings:wiki/metrics/spec-review/2026.csv -->
(chart content regenerated here)
<!-- /xmr -->
```

The command replaces each block with the current XmR chart from the referenced
CSV. It adds a `**Signals:**` line that lists any fired rules (`xRule1`,
`mrRule1`, ...). When the metric has fewer than 15 points, the block shows an
"Insufficient data" line instead. The command leaves files without markers
unchanged. The operation is idempotent, so two runs produce the same output.

`refresh` also sweeps expired rows from the `## Active Claims` table in
`MEMORY.md` in the same pass. A stale claim then no longer gives a false signal
of work in flight. By default a claim expires one day after you make it, so the
table holds only active work.

## Recording the product-mix metric

Your team tracks how much of its merged work is product-facing and how much is
internal. The `product-mix` command computes that share directly from merged
pull requests and records it as a metric that the XmR pipeline can chart.

```sh
npx gemba-wiki product-mix
```

The command looks at pull requests merged into `main` in a rolling window,
which is the last seven days by default. It counts each pull request by its
`product` or `internal` label. It then appends a `product_share` row to
`wiki/metrics/product-mix/<YYYY>.csv`. The value is the percentage of labeled
PRs that have the `product` label:

```text
product_share = round(product / (product + internal) * 100)
```

The command reads those two labels but does not apply them. Your team decides
which changes count as product work and labels each pull request during
review. [Kata](https://www.kata.team/), the reference tenant for this
platform, publishes one such labeling practice. Any team can define its own.

To analyze a specific window, pass the bounds:

```sh
npx gemba-wiki product-mix --since 2026-06-01 --until 2026-06-27
```

The command is deterministic, so two runs over the same merged PRs produce the
same value. A window with no labeled merged PRs records no row, which avoids a
meaningless zero-over-zero ratio. The recorded row goes through the same
analysis path as every other metric. To turn it into a control chart, read
[Chart a Metric and Check Variation](/docs/predictable-team/xmr-analysis/).

| Flag      | Required | Description                                              |
| --------- | -------- | ------------------------------------------------------- |
| `--since` | No       | Window start ISO date (default: `--until` minus 7 days).|
| `--until` | No       | Window end ISO date (default: today).                   |
| `--run`   | No       | Run id recorded on the metric row (default: `gh-live`). |
| `--repo`  | No       | `owner/repo` slug (default: the `origin` remote).       |

## Syncing wiki state

The wiki is a separate git repository cloned into `wiki/` inside your project.
Two commands keep it in sync:

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

`push` does nothing when no local changes exist. Local state wins on conflicts
in the markdown surfaces: summaries, memos, and the storyboard. Metrics CSVs
are the one exception. They merge and keep both sides (see
[Concurrent metrics appends](#concurrent-metrics-appends) below). `pull` exits
non-zero with a diagnostic when it detects a conflict.

Run `pull` from a Claude Code SessionStart hook and `push` from a Stop hook.
Run both from your GitHub Actions post-run steps as well.

### Concurrent metrics appends

Two sessions often append metric rows to the same `metrics/**/*.csv` file at
the same time. For these files the sync keeps the rows from both sides, so a
concurrent append never erases another session's row.

A tracked `.gitattributes` line in the wiki sets this behavior:

```text
metrics/**/*.csv merge=union
```

Because the file is tracked, the rule applies to every clone. Fresh wikis get
it at `init`, and existing wikis get it on their next sync. The protection
starts with the first sync after the line is in place.

When the sync keeps both sides, it can leave an identical row twice. The sync
never removes a duplicate on its own. Instead, `gemba-wiki audit` reports a
`metrics-csv.duplicate-row` finding with the file and the line. The row's
owner then resolves it in one of two ways:

- Delete the extra row if it is an accidental repeat.
- Edit any column (a run id or a note) if the rows are distinct
  measurements. The edit makes the rows differ, and the finding no longer
  fires.

To run the audit and act on every finding, read
[Audit and Auto-Fix the Wiki](/docs/predictable-team/wiki-integrity/).

## Secret scanning in wiki pushes

Your wiki is public as soon as it pushes. A GitHub Wiki repository cannot run
GitHub Actions or GitHub secret-scanning, so the push path is the only place a
secret-leak control can live. Every command that pushes the wiki (`claim`,
`release`, `push`) runs a fail-closed secret scan over the content that the
push introduces. The scan runs before any network contact.

When the scan finds a secret, the command stops without a push. It does not
fall back to "saved locally". It exits non-zero with the finding location:

```text
push blocked: secret detected in wiki content (MEMORY.md:42:github-pat); the push was not attempted.
```

A network or credential failure is different. That case still degrades to
"saved locally" and succeeds, because the change is on disk and a later push
retries it. Only a detected secret or a missing scanner blocks the command.

### Provisioning the scanner

The scan uses [gitleaks](https://github.com/gitleaks/gitleaks). Install it on
the machine that runs `gemba-wiki` and make it resolvable on `PATH`. The
command accepts any version it can run. Pin one version across your developer
machines and your CI jobs, so that the same content produces the same findings
everywhere. Check the installed version before you rely on the gate:

```sh
gitleaks version
```

If gitleaks is not available, the push fails closed instead of skipping the
scan:

```text
push blocked: the secret scanner (gitleaks) is unavailable; the push was not attempted.
```

A detective control that turns itself off without a message protects nothing,
so the command treats a missing scanner as a refusal.

### Break-glass overrides

Two overrides, both off by default, let an operator proceed past a confirmed
false positive or an unavoidable missing scanner. Each override is a separate
environment variable, so the override for a routine false positive can never
bypass a later missing-scanner refusal. Each override must have a reason, and
each one writes a durable audit line when you use it.

| Override | Permits | Set it to |
| --- | --- | --- |
| `FIT_WIKI_SECRET_OVERRIDE` | A detected finding | The reason for the override |
| `FIT_WIKI_SCANNER_ABSENT_OK` | A missing scanner | The reason for the override |

```sh
FIT_WIKI_SECRET_OVERRIDE="example token in MEMORY.md is a documented sample" npx gemba-wiki push
```

Each override appends one line to `secret-overrides.log` in the wiki tree, and
the same push commits that line. The line records the timestamp, the operator
identity, the override class, and the reason. For a finding, it also records
the location (`file:line:rule`). It never records the matched secret value.

The recorded identity comes from `git config user.email`, which the operator
sets and nothing verifies. Read the log as a record of who took responsibility
for the push, and do not read it as cryptographic proof.

## Bootstrapping the wiki

If your project does not have a wiki yet, `init` sets one up:

```sh
npx gemba-wiki init
```

```text
init: wiki ready at /home/you/repo/wiki
```

The command clones the repository's wiki into `wiki/`. Set `FIT_WIKI_URL` to
override the wiki URL when the default derivation from `origin` does not
resolve.

`init` also pre-creates a `wiki/metrics/<skill>/` directory for each skill under
`.claude/skills/` whose directory name starts with `kata-`. That prefix refers
to the reference tenant, [Kata](https://www.kata.team/). A skill with any
other prefix gets no directory at `init` time, and the directory is not a
requirement. `gemba-xmr record` creates the directory it needs when it writes
the first row, so a metric under any skill name still charts correctly.

The command is idempotent, so it is safe to run on an initialized wiki. It
authenticates with `GH_TOKEN` or `GITHUB_TOKEN` from the environment, or with
a logged-in `gh` CLI.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-integrity -->
<!-- part:card:../collision-ledger -->
<!-- part:card:../xmr-analysis -->

</div>

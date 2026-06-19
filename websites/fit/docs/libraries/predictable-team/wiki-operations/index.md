---
title: Send a Memo or Update a Storyboard
description: Communicate across your agent team and keep storyboards current — without managing the wiki infrastructure yourself.
---

Your agent team uses a wiki for persistent memory -- summaries, metrics, memos,
storyboards. You need to send a message to a teammate, update the charts in a
storyboard, or make sure the wiki is in sync before a session starts. You do not
need to understand how the wiki is structured internally. `fit-wiki` handles the
plumbing.

This guide covers the two most common wiki operations: sending memos and
refreshing storyboard charts. It also covers syncing and bootstrapping the wiki
for completeness. For a deeper look at how the wiki serves as persistent memory
for your agent team, see the
[Persistent Memory](/docs/libraries/predictable-team/) guide.

## Prerequisites

- Node.js 18+
- A wiki already initialized in your project (see
  [Bootstrapping the wiki](#bootstrapping-the-wiki) if not)

## Sending a memo

You need to notify a teammate about something they should see on their next run.
The `memo` command appends a timestamped message to the teammate's inbox.

```sh
npx fit-wiki memo --from technical-writer --to staff-engineer --message "check baseline"
```

```
wrote wiki/staff-engineer.md
```

The message appears at the top of the teammate's `## Message Inbox` section as a
single markdown bullet:

```markdown
- 2026-05-04 from **technical-writer**: check baseline
```

Newest memos appear first. Multi-line messages are collapsed to a single line.

### Broadcasting to all teammates

To reach every agent except yourself:

```sh
npx fit-wiki memo --from technical-writer --to all --message "new XmR baseline"
```

```
wrote wiki/staff-engineer.md
wrote wiki/security-engineer.md
wrote wiki/improvement-coach.md
```

The sender is automatically excluded from the broadcast.

### Memo options

| Flag          | Required | Description                                                            |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `--from`      | No       | Sender name (falls back to `LIBEVAL_AGENT_PROFILE` env var)            |
| `--to`        | Yes      | Target agent name, or `all` to broadcast                               |
| `--message`   | Yes      | Message text                                                           |
| `--wiki-root` | No       | Override wiki root directory (default: auto-detected from project root) |

If `--from` is omitted and `LIBEVAL_AGENT_PROFILE` is not set, the command exits
with an error.

### The marker contract

Each agent summary file must contain a `<!-- memo:inbox -->` HTML comment
directly under the `## Message Inbox` heading:

```markdown
## Message Inbox

<!-- memo:inbox -->

- 2026-05-04 from **technical-writer**: check baseline
```

The marker is invisible in rendered markdown. If it is missing, the command exits
with code 2 and a diagnostic message. The marker is placed once during wiki
initialization and should not be removed.

## Refreshing storyboard charts

Your storyboard contains XmR chart blocks that visualize metrics over time. When
new metric rows land in the CSV files, the charts need regenerating. The
`refresh` command does that in place.

```sh
npx fit-wiki refresh
```

Without a path argument, this targets the current month's storyboard at
`wiki/storyboard-YYYY-MNN.md`. To refresh a specific file:

```sh
npx fit-wiki refresh wiki/storyboard-2026-M05.md
```

The command scans the file for marker pairs like this:

```markdown
<!-- xmr:findings:wiki/metrics/kata-spec/2026.csv -->
(chart content regenerated here)
<!-- /xmr -->
```

Each block is replaced with the current XmR chart from the referenced CSV plus
a `**Signals:**` line naming any fired rules (`xRule1`, `mrRule1`, ...); when
the metric has fewer than 15 points the block carries an "Insufficient data"
line instead. Files without markers are left unchanged. The operation is
idempotent -- running it twice produces the same output.

## Syncing wiki state

The wiki is a separate git repository cloned into `wiki/` within your project.
Two commands keep it synchronized:

```sh
npx fit-wiki pull
```

```
pull: up to date
```

```sh
npx fit-wiki push
```

```
push: committed and pushed
```

`push` is a no-op when no local changes exist. On conflicts in markdown
surfaces -- summaries, memos, the storyboard -- local state wins. Metrics CSVs
are the one exception: they merge by keeping both sides (see
[Concurrent metrics appends](#concurrent-metrics-appends) below). `pull` exits
non-zero with a diagnostic when a conflict is detected.

Both commands are designed for use in Claude Code hooks (e.g., `pull` in
SessionStart, `push` in Stop) and GitHub Actions post-run steps.

### Concurrent metrics appends

Two sessions often append metric rows to the same `metrics/**/*.csv` file at
once. For these files the sync keeps the rows from both sides instead of
letting the last writer win. A concurrent append never erases another session's
row.

This behavior is carried by a tracked `.gitattributes` line in the wiki:

```
metrics/**/*.csv merge=union
```

Because the file is tracked, the rule governs every clone. Fresh wikis get it at
`init`. Existing wikis get it on their next sync, and protection begins the sync
after the line lands.

Keeping both sides can leave an identical row twice. The sync never removes a
duplicate on its own. Instead, `fit-wiki audit` reports a
`metrics-csv.duplicate-row` finding that names the file and the line. The row's
owner then resolves it one of two ways:

- Delete the surplus row if it is an accidental repeat.
- Edit any column -- a run id or a note -- if the rows are genuinely distinct
  measurements. The edit makes the rows differ, and the finding stops firing.

## Secret scanning in wiki pushes

Your wiki is public the moment it pushes, and a GitHub Wiki repository cannot
run GitHub Actions or GitHub secret-scanning. The push path is therefore the
only place a secret-leak control can live. Every command that pushes the wiki
(`claim`, `release`, `push`) runs a fail-closed secret scan over the content
the push introduces before any network contact.

When the scan finds a secret, the command stops. It does not push, it does not
fall back to "saved locally", and it exits non-zero with the finding location:

```
push blocked: secret detected in wiki content (MEMORY.md:42:github-pat); the push was not attempted.
```

A network or credential failure is different. That still degrades to "saved
locally" and succeeds — the change is on disk and a later push retries it. Only
a detected secret or a missing scanner blocks the command.

### Provisioning the scanner

The scan uses [gitleaks](https://github.com/gitleaks/gitleaks). Install it on
the machine that runs `fit-wiki` and make it resolvable on `PATH`. Pin the same
version the repository's CI standardises on:

```sh
gitleaks version   # expect 8.24.3
```

If gitleaks is not available, the push fails closed rather than skipping the
scan:

```
push blocked: the secret scanner (gitleaks) is unavailable; the push was not attempted.
```

A detective control that silently disables itself is not a control, so a
missing scanner is treated as a refusal, never a pass.

### Break-glass overrides

Two off-by-default overrides let an operator proceed past a confirmed false
positive or an unavoidable missing scanner. Each is a separate environment
variable, so clearing a routine false positive can never silently bypass a
later missing-scanner refusal. Each must carry a reason, and using either one
writes a durable audit line.

| Override | Permits | Set it to |
| --- | --- | --- |
| `FIT_WIKI_SECRET_OVERRIDE` | A detected finding | The reason for overriding |
| `FIT_WIKI_SCANNER_ABSENT_OK` | A missing scanner | The reason for overriding |

```sh
FIT_WIKI_SECRET_OVERRIDE="example token in MEMORY.md is a documented sample" npx fit-wiki push
```

Each override appends one line to `secret-overrides.log` in the wiki tree and
commits it in the same push. The line records the timestamp, the operator
identity, the override class, the reason, and — for a finding — the location
(`file:line:rule`). It never records the matched secret value.

The recorded identity is read from `git config user.email`. It is a
self-asserted attribution of intent, not an authenticated identity. Treat the
log as a record of who claimed responsibility, not cryptographic proof.

## Bootstrapping the wiki

If your project does not have a wiki yet, `init` sets one up:

```sh
npx fit-wiki init
```

```
init: wiki ready at wiki
```

This clones the repository's wiki into `wiki/` and creates
`wiki/metrics/<skill>/` directories for each skill found under
`.claude/skills/`. Set `FIT_WIKI_URL` to override the wiki URL when the
default derivation from `origin` does not resolve.

Idempotent -- safe to run on an already-initialized wiki. Authenticates
using `GH_TOKEN` or `GITHUB_TOKEN` from the environment, or a logged-in
`gh` CLI.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../xmr-analysis -->

</div>

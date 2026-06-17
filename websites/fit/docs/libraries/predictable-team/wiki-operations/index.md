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
| `--from`      | Yes      | Sender name (no environment fallback)                                  |
| `--to`        | Yes      | Target agent name, or `all` to broadcast                               |
| `--message`   | Yes      | Message text                                                           |
| `--wiki-root` | No       | Override wiki root directory (default: auto-detected from project root) |

If `--from` is omitted the command exits with an error before writing anything.

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

`push` is a no-op when no local changes exist. On conflicts, local state wins.
`pull` exits non-zero with a diagnostic when a conflict is detected.

Both commands are designed for use in Claude Code hooks (e.g., `pull` in
SessionStart, `push` in Stop) and GitHub Actions post-run steps.

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

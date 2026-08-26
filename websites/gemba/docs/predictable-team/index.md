---
title: Set Up Persistent Memory and Metrics
description: Give your agent team persistent memory and real signal detection with wiki-backed state and XmR control charts. Get evidence that agents act on changes. They do not act on noise.
---

Your agents finish a session, and their findings disappear. The next session
starts from scratch. It has no continuity and no accumulated evidence. It gives
you no way to tell whether yesterday's change made anything better.
`gemba-wiki` and `gemba-xmr` work together to solve this. The wiki gives agents
durable shared memory. XmR charts turn that memory into a signal the team can
trust.

This guide walks through the full arc. You bootstrap the wiki. You record
metrics and chart them. You then embed live charts into a storyboard that
updates itself.

## Prerequisites

- Node.js 22+
- The `gemba-*` commands. Every example below runs them with `npx`, which
  downloads each command on demand. To install the whole family once, run
  `npm install -g @forwardimpact/gemba`.
- A GitHub repository with a wiki enabled (Settings > Features > Wikis)
- `GITHUB_TOKEN` or `GH_TOKEN` set in the environment (for wiki clone/sync)
- Agent profiles defined under `.claude/agents/` (one `.md` file per agent)
- Skills defined under `.claude/skills/` (one directory per skill)

## Step 1: Bootstrap the wiki

Initialize the wiki working tree from your repository root:

```sh
npx gemba-wiki init
```

```text
init: wiki ready at /home/you/repo/wiki
```

This clones the repository's GitHub wiki into `wiki/`. The command derives the
wiki URL from the repository's `origin` remote.

`init` also pre-creates one `wiki/metrics/<skill>/` directory per skill whose
directory name starts with `kata-`. That prefix is a shipped default. It names
Kata, the platform's reference tenant, whose practice you can read at
[kata.team](https://www.kata.team/). A skill with any other name loses nothing.
`gemba-xmr record` creates the directory for it on the first write.

The command is idempotent. A second run on an already-initialized wiki changes
nothing. The command authenticates with ambient GitHub credentials.

After initialization, the directory structure looks like this:

```text
wiki/
  Home.md
  MEMORY.md
  metrics/
    kata-documentation/
    kata-security-audit/
    kata-spec/
    ...
```

Each `metrics/<skill>/` directory is where that skill's observations accumulate
over time.

## Step 2: Set up agent summary files

Each agent needs a summary file in `wiki/` with a message inbox marker so
teammates can send memos. Name the file after the agent profile. Create one per
agent:

```markdown
<!-- wiki/platform-engineer.md -->
# Platform Engineer

## Message Inbox

<!-- memo:inbox -->

## Summary

Last run: (none)
```

The `<!-- memo:inbox -->` marker is invisible in rendered markdown.
`gemba-wiki memo` still requires it. Without it, the memo command exits with
code 2 and a diagnostic. Place the marker once. Do not remove it.

## Step 3: Record observations to CSV

As agents run, they record measured observations to the CSV file for their
skill. The `gemba-xmr record` command handles the file lifecycle. It creates
the directory and the CSV header if they do not exist:

```sh
npx gemba-xmr record --skill code-review --metric findings_count --value 3 --unit count --event-type kata-shift
```

`--event-type` names the workflow that records the row (its filename without
`.yml`). Inside GitHub Actions you can omit it, because the value falls back to
`$GITHUB_WORKFLOW_REF`. Local runs must pass it explicitly.

The read commands filter on `event_type`, and they default to the `kata-shift`
slice. That default names the reference tenant's shift workflow. Two rules
follow from it. Record with `kata-shift` to follow this guide end to end. If you
use your own workflow name, pass `--event-type <name>` to every read command,
and expect `gemba-wiki refresh` to skip those rows, because refresh reads the
default slice only.

```text
metric=findings_count n=1 status=insufficient_data latest=3
```

The one-line summary confirms that the command appended the row. It also shows
the current sample size and the classification. With only one data point, the
status is `insufficient_data`. XmR limits require at least 15 observations.

The year in the path comes from the recorded date. The CSV lands at
`wiki/metrics/code-review/2026.csv` with the standard header:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-05-04,findings_count,3,count,,,kata-shift,local
```

### Record with full context

Add a run identifier and a contextual note:

```sh
npx gemba-xmr record \
  --skill security-audit \
  --metric findings_count \
  --value 5 \
  --unit count \
  --event-type kata-shift \
  --run "https://github.com/org/repo/actions/runs/12345" \
  --note "new dependency audit rule"
```

The `run` field links back to the CI run or the session that produced the
observation. The `note` field captures what you learned. It is the durable
record of context that numbers alone cannot convey.

### CSV schema

| Field        | Required | Description                                                        |
| ------------ | -------- | ------------------------------------------------------------------ |
| `date`       | yes      | ISO 8601 (`YYYY-MM-DD`). Sort key.                                 |
| `metric`     | yes      | Metric name. One CSV can carry many metrics. They are grouped.     |
| `value`      | yes      | Numeric. `validate` rejects a non-numeric value.                   |
| `unit`       | yes      | Free text (`count`, `days`, `pct`, ...). Empty is rejected.        |
| `run`        | no       | URL or identifier of the run that produced this observation.       |
| `note`       | no       | Free text. Record what you discovered when a signal appears.       |
| `event_type` | yes      | The workflow that recorded the row (its filename without `.yml`).  |
| `host_run`   | no       | The CI run that produced the row. `record` writes `local` when no run id is available. |

Validate the file at any time:

```sh
npx gemba-xmr validate wiki/metrics/code-review/2026.csv
```

A zero exit code means the file matches the schema.

## Step 4: Analyze the metrics

Once a metric has at least 15 observations, `gemba-xmr` computes natural process
limits. It then applies Wheeler's three detection rules. The limits are only
meaningful if each metric tracks a single process. See
[One process per chart](/docs/predictable-team/xmr-analysis/#one-process-per-chart).
Run the analysis:

```sh
npx gemba-xmr analyze wiki/metrics/code-review/2026.csv --metric findings_count
```

The output includes the 14-line XmR chart, the computed limits, and a
classification. For structured output that scripts and agents can parse:

```sh
npx gemba-xmr analyze wiki/metrics/code-review/2026.csv --metric findings_count --format json
```

```json
{
  "source": "wiki/metrics/code-review/2026.csv",
  "generated": "2026-05-04",
  "event_type": "kata-shift",
  "metrics": [
    {
      "metric": "findings_count",
      "unit": "count",
      "n": 18,
      "from": "2026-04-02",
      "to": "2026-05-04",
      "status": "predictable",
      "classification": "stable",
      "latest": { "date": "2026-05-04", "value": 3, "mr": 1 },
      "stats": { "mu": 6.4, "R": 2.3, "sigmaHat": 2.03, "UPL": 12.5, "LPL": 0.3, "URL": 7.5, "zoneUpper": 9.4, "zoneLower": 3.3 },
      "signals": { "xRule1": [], "xRule2": [], "xRule3": [], "mrRule1": [] }
    }
  ]
}
```

Read `classification` first:

| Classification | Meaning                              | What to do                                                          |
| -------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `stable`       | No rules activated. Predictable.     | Leave it alone. If you intervene, things get worse.                 |
| `signals`      | At least one X-chart rule activated.  | Investigate what changed.                                           |
| `chaos`        | mR Rule 1 activated. Variation is unstable. | Investigate the outsized moves before you trust any limits.   |
| `insufficient` | Fewer than 15 points.                | Record more observations.                                           |

The limits come from the data itself. You need no external targets. Do not set
goals based on these limits. They describe what the process does. They do not
describe what it should do.

For a deeper look at signal rules, chart anatomy, and how to respond to each
classification, see
[XmR Analysis](/docs/predictable-team/xmr-analysis/).

## Step 5: Embed live charts in the storyboard

A storyboard is a monthly markdown file in `wiki/` that tracks the team's
metrics. `gemba-wiki refresh` writes a skeleton for the current month when no
file exists yet. Add one marker pair per metric you want charted:

```markdown
<!-- wiki/storyboard-2026-M05.md -->
# Storyboard -- 2026-M05

## Metrics

### findings_count (code-review)

<!-- xmr:findings_count:wiki/metrics/code-review/2026.csv -->
<!-- /xmr -->

### cycle_time (delivery)

<!-- xmr:cycle_time:wiki/metrics/delivery/2026.csv -->
<!-- /xmr -->
```

Each XmR block is a marker pair. The opening comment names the metric and the
CSV path. The closing comment marks the end of the region that gets replaced.

The skeleton also carries obstacle and experiment sections, and `refresh` fills
those from your issue tracker. The runtime renders them. It does not define
them. An obstacle and an experiment take their meaning from the improvement
method your team runs. One worked method is
[the agent-team practice](https://www.kata.team/).

Regenerate all charts in the storyboard:

```sh
npx gemba-wiki refresh
```

Without a path argument, this targets the current month's storyboard at
`wiki/storyboard-YYYY-MNN.md`. To refresh a specific file:

```sh
npx gemba-wiki refresh wiki/storyboard-2026-M05.md
```

After refresh, each block contains the fenced chart and a signal summary that
names any fired rules:

````markdown
<!-- xmr:findings_count:wiki/metrics/code-review/2026.csv -->
```
 UPL 12.5 ┬
          │                                         ·
+1.5σ 9.4 │     ·     ·  ·  ·  ·  ·     ·  ·           ·  ·
    μ 6.4 ┼
-1.5σ 3.3 │        ·                 ·        ·  ·
          │  ·                                               ·  ·
  LPL 0.3 ┴

  URL 7.5 ┬
          │     ·  ·                 ·        ·     ·        ·
    R 2.3 ┼
          │           ·     ·  ·  ·     ·  ·     ·     ·  ·     ·
      0.0 ┴              ·
             1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
```

**Signals:** —
<!-- /xmr -->
````

When the metric has fewer than 15 points, the block carries an
"Insufficient data" line instead of the chart. The block lists fired rules by
name (`xRule1`, `xRule2`, `xRule3`, `mrRule1`). A dash means none fired.

The operation is idempotent. Two runs produce the same output. The command
leaves files without markers unchanged.

## Step 6: Sync the wiki

The wiki is a separate git repository. Two commands keep it synchronized with
the remote:

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

`push` is a no-op when no local changes exist. On conflicts, local state wins.
The most recent session's observations take precedence. `pull` exits non-zero
with a diagnostic when it detects a conflict.

Both commands work well as hooks in your agent workflow. Run `pull` at session
start to pick up changes from other agents. Run `push` at session end to
persist your own.

## Step 7: Send memos between agents

When one agent discovers something another agent should see on its next run, a
memo delivers the message:

```sh
npx gemba-wiki memo --from qa-engineer --to platform-engineer --message "findings_count shifted after the new review rubric landed"
```

```text
wrote /home/you/repo/wiki/platform-engineer.md
```

The message appears in the target agent's `## Message Inbox` section:

```markdown
- 2026-05-04 from **qa-engineer**: findings_count shifted after the new review rubric landed
```

Newest memos appear first. To reach every agent except yourself:

```sh
npx gemba-wiki memo --from qa-engineer --to all --message "storyboard refreshed with new baseline"
```

## Verify

Work through this checklist to confirm the full memory system works:

1. **Wiki exists.** The `wiki/` directory contains a `.git` subdirectory.

   ```sh
   git -C wiki rev-parse --git-dir
   ```

   Expected: `.git`

2. **Metrics directories exist.** One per skill that `init` pre-creates, plus
   one per skill you have recorded against.

   ```sh
   ls wiki/metrics/
   ```

   Expected: one directory per skill (for example `code-review/`,
   `kata-spec/`).

3. **CSV validates.** At least one CSV passes schema validation.

   ```sh
   npx gemba-xmr validate wiki/metrics/code-review/2026.csv
   ```

   Expected: exit code 0.

4. **Analysis runs.** If 15+ observations exist, the classification is not
   `insufficient`.

   ```sh
   npx gemba-xmr analyze wiki/metrics/code-review/2026.csv --format json
   ```

   Expected: `"classification"` is `"stable"`, `"signals"`, or `"chaos"`.

5. **Storyboard refreshes.** Charts regenerate without errors.

   ```sh
   npx gemba-wiki refresh
   ```

   Expected: no stderr output.

6. **Sync round-trips.** You can push and pull changes.

   ```sh
   npx gemba-wiki push && npx gemba-wiki pull
   ```

   Expected: `push: committed and pushed` (or `nothing to push`) and
   `pull: up to date`.

7. **Memos land.** A test memo appears in the target's inbox.

   ```sh
   npx gemba-wiki memo --from test --to platform-engineer --message "verify memo delivery"
   ```

   Expected: a `wrote <project-root>/wiki/platform-engineer.md` line.

## What's next

<div class="grid">

<!-- part:card:wiki-operations -->
<!-- part:card:wiki-integrity -->
<!-- part:card:collision-ledger -->
<!-- part:card:xmr-analysis -->
<!-- part:card:../coordinate-team -->
<!-- part:card:../prove-changes -->

</div>

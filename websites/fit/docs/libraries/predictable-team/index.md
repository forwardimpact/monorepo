---
title: Set Up Persistent Memory and Metrics
description: Give your agent team persistent memory and real signal detection — wiki-backed state, XmR control charts, and evidence that agents act on changes, not noise.
---

Your agents finish a session, and their findings disappear. The next session
starts from scratch -- no continuity, no accumulated evidence, no way to tell
whether yesterday's change made anything better. `fit-wiki` and `fit-xmr` work
together to solve this: the wiki gives agents durable shared memory, and XmR
charts turn that memory into a signal the team can trust.

This guide walks through the full arc -- from bootstrapping the wiki through
recording metrics, charting them, and embedding live charts into a storyboard
that updates itself.

## Prerequisites

- Node.js 18+
- A GitHub repository with a wiki enabled (Settings > Features > Wikis)
- `GITHUB_TOKEN` or `GH_TOKEN` set in the environment (for wiki clone/sync)
- Agent profiles defined under `.claude/agents/` (one `.md` file per agent)
- Skills defined under `.claude/skills/` (one `kata-*` directory per skill)

## Step 1: Bootstrap the wiki

Initialize the wiki working tree from your repository root:

```sh
npx fit-wiki init
```

```
init: wiki ready at wiki
```

This clones the repository's GitHub wiki into `wiki/` and creates a
`wiki/metrics/<skill>/` directory for every `kata-*` skill found under
`.claude/skills/`. The wiki URL is derived from the repository's `origin`
remote.

The command is idempotent -- running it again on an already-initialized wiki
changes nothing. It authenticates using ambient GitHub credentials.

After initialization, the directory structure looks like this:

```
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
teammates can send memos. Create one per agent:

```markdown
<!-- wiki/staff-engineer.md -->
# Staff Engineer

## Message Inbox

<!-- memo:inbox -->

## Summary

Last run: (none)
```

The `<!-- memo:inbox -->` marker is invisible in rendered markdown but required
by `fit-wiki memo`. Without it, the memo command exits with code 2 and a
diagnostic. Place the marker once; do not remove it.

## Step 3: Record observations to CSV

As agents run, they record measured observations to the CSV file for their
skill. The `fit-xmr record` command handles the file lifecycle -- it creates the
directory and CSV header if they do not exist:

```sh
npx fit-xmr record --skill kata-spec --metric findings_count --value 3 --unit count --event-type kata-shift
```

`--event-type` names the workflow recording the row (its filename without
`.yml`). Inside GitHub Actions it can be omitted — the value falls back to
`$GITHUB_WORKFLOW_REF` — but local runs must pass it explicitly.

```
metric=findings_count n=1 status=insufficient_data latest=3
```

The one-line summary confirms the row was appended and shows the current sample
size and classification. With only one data point, the status is
`insufficient_data` -- XmR limits require at least 15 observations.

The CSV lands at `wiki/metrics/kata-spec/2026.csv` (year derived from the
recording date) with the standard header:

```csv
date,metric,value,unit,run,note,event_type
2026-05-04,findings_count,3,count,,,kata-shift
```

### Recording with full context

Add a run identifier and a contextual note:

```sh
npx fit-xmr record \
  --skill kata-security-audit \
  --metric findings_count \
  --value 5 \
  --unit count \
  --event-type kata-shift \
  --run "https://github.com/org/repo/actions/runs/12345" \
  --note "new dependency audit rule"
```

The `run` field links back to the CI run or session that produced the
observation. The `note` field captures what you learned -- it is the durable
record of context that numbers alone cannot convey.

### CSV schema

| Field        | Required | Description                                                          |
| ------------ | -------- | -------------------------------------------------------------------- |
| `date`       | yes      | ISO 8601 (`YYYY-MM-DD`). Sort key.                                   |
| `metric`     | yes      | Metric name. One CSV may carry multiple metrics; they are grouped.   |
| `value`      | yes      | Numeric. Non-numeric values are rejected by `validate`.              |
| `unit`       | yes      | Free text (`count`, `days`, `pct`, ...). Empty is rejected.          |
| `run`        | no       | URL or identifier of the run that produced this observation.         |
| `note`       | no       | Free text. Record what you discovered when a signal appears.         |
| `event_type` | yes      | The workflow that recorded the row — its filename without `.yml`.    |

Validate the file at any time:

```sh
npx fit-xmr validate wiki/metrics/kata-spec/2026.csv
```

A zero exit code means the file matches the schema.

## Step 4: Analyze the metrics

Once a metric has at least 15 observations, `fit-xmr` computes natural process
limits and applies Wheeler's three detection rules. The limits are only
meaningful if each metric tracks a single process -- see
[One process per chart](/docs/libraries/predictable-team/xmr-analysis/#one-process-per-chart).
Run the analysis:

```sh
npx fit-xmr analyze wiki/metrics/kata-spec/2026.csv --metric findings_count
```

The output includes the 14-line XmR chart, the computed limits, and a
classification. For structured output that scripts and agents can parse:

```sh
npx fit-xmr analyze wiki/metrics/kata-spec/2026.csv --metric findings_count --format json
```

```json
{
  "source": "wiki/metrics/kata-spec/2026.csv",
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
      "stats": { "mu": 4.2, "UPL": 12.5, "LPL": 0, "URL": 7.5 },
      "signals": { "xRule1": [], "xRule2": [], "xRule3": [], "mrRule1": [] }
    }
  ]
}
```

Read `classification` first:

| Classification | Meaning                              | What to do                                                          |
| -------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `stable`       | No rules activated. Predictable.     | Leave it alone. Intervening makes things worse.                     |
| `signals`      | At least one X-chart rule activated.  | Investigate what changed.                                           |
| `chaos`        | mR Rule 1 activated. Variation is unstable. | Investigate the outsized moves before trusting any limits.    |
| `insufficient` | Fewer than 15 points.                | Keep recording.                                                     |

The limits come from the data itself -- no external targets needed. Do not set
goals based on these limits. They describe what the process does, not what it
should do.

For a deeper look at signal rules, chart anatomy, and how to respond to each
classification, see [XmR Analysis](/docs/libraries/predictable-team/xmr-analysis/).

## Step 5: Embed live charts in the storyboard

A storyboard is a monthly markdown file in `wiki/` that tracks the team's
metrics, obstacles, and experiments. Create one for the current month:

```markdown
<!-- wiki/storyboard-2026-M05.md -->
# Storyboard -- 2026-M05

## Metrics

### findings_count (kata-spec)

<!-- xmr:findings_count:wiki/metrics/kata-spec/2026.csv -->
<!-- /xmr -->

### cycle_time (kata-implement)

<!-- xmr:cycle_time:wiki/metrics/kata-implement/2026.csv -->
<!-- /xmr -->

## Obstacles

(none yet)

## Experiments

(none yet)
```

Each XmR block is a marker pair: the opening comment names the metric and the
CSV path; the closing comment marks the end of the region that gets replaced.

Regenerate all charts in the storyboard:

```sh
npx fit-wiki refresh
```

Without a path argument, this targets the current month's storyboard at
`wiki/storyboard-YYYY-MNN.md`. To refresh a specific file:

```sh
npx fit-wiki refresh wiki/storyboard-2026-M05.md
```

After refresh, each block contains the fenced chart and a signal summary
naming any fired rules:

```markdown
<!-- xmr:findings_count:wiki/metrics/kata-spec/2026.csv -->
```
 UPL 12.5 ──────────────────────────────────────────────
          |
+1.5s 9.4 |        .           .  .              .
    m 6.4 +---------------------------------------------
-1.5s 3.4 |  .  .     .  .  .        .     .  .     .  .
          |
  LPL 0.3 ──────────────────────────────────────────────
```

**Signals:** --
<!-- /xmr -->
```

When the metric has fewer than 15 points, the block carries an
"Insufficient data" line instead of the chart. Fired rules are listed by
name (`xRule1`, `xRule2`, `xRule3`, `mrRule1`); a dash means none fired.

The operation is idempotent -- running it twice produces the same output. Files
without markers are left unchanged.

## Step 6: Sync the wiki

The wiki is a separate git repository. Two commands keep it synchronized with
the remote:

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

`push` is a no-op when no local changes exist. On conflicts, local state wins --
the most recent session's observations take precedence. `pull` exits non-zero
with a diagnostic when a conflict is detected.

Both commands work well as hooks in your agent workflow: `pull` at session start
to pick up changes from other agents, `push` at session end to persist your
own.

## Step 7: Send memos between agents

When one agent discovers something another agent should see on its next run, a
memo delivers the message:

```sh
npx fit-wiki memo --from technical-writer --to staff-engineer --message "findings_count shifted after the new spec rubric landed"
```

```
wrote wiki/staff-engineer.md
```

The message appears in the target agent's `## Message Inbox` section:

```markdown
- 2026-05-04 from **technical-writer**: findings_count shifted after the new spec rubric landed
```

Newest memos appear first. To reach every agent except yourself:

```sh
npx fit-wiki memo --from technical-writer --to all --message "storyboard refreshed with new baseline"
```

## Verify

Confirm the full memory system is working by running through this checklist:

1. **Wiki exists.** The `wiki/` directory contains a `.git` subdirectory.

   ```sh
   git -C wiki rev-parse --git-dir
   ```

   Expected: `.git`

2. **Metrics directories exist.** One per `kata-*` skill.

   ```sh
   ls wiki/metrics/
   ```

   Expected: one directory per skill (e.g., `kata-spec/`, `kata-documentation/`).

3. **CSV validates.** At least one CSV passes schema validation.

   ```sh
   npx fit-xmr validate wiki/metrics/kata-spec/2026.csv
   ```

   Expected: exit code 0.

4. **Analysis runs.** If 15+ observations exist, the classification is not
   `insufficient`.

   ```sh
   npx fit-xmr analyze wiki/metrics/kata-spec/2026.csv --format json
   ```

   Expected: `"classification"` is `"stable"`, `"signals"`, or `"chaos"`.

5. **Storyboard refreshes.** Charts regenerate without errors.

   ```sh
   npx fit-wiki refresh
   ```

   Expected: no stderr output.

6. **Sync round-trips.** Changes can be pushed and pulled.

   ```sh
   npx fit-wiki push && npx fit-wiki pull
   ```

   Expected: `push: committed and pushed` (or `nothing to push`) and
   `pull: up to date`.

7. **Memos land.** A test memo appears in the target's inbox.

   ```sh
   npx fit-wiki memo --from test --to staff-engineer --message "verify memo delivery"
   ```

   Expected: `wrote wiki/staff-engineer.md`.

## What's next

<div class="grid">

<!-- part:card:wiki-operations -->
<!-- part:card:wiki-integrity -->
<!-- part:card:collision-ledger -->
<!-- part:card:xmr-analysis -->

</div>

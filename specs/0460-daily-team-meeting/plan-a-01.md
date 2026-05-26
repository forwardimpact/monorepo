# Plan 0460-A Part 01 — kata-metrics Utility Skill

## Scope

Create the metrics infrastructure utility skill. Three new files, no
modifications.

## Files

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `.claude/skills/kata-metrics/SKILL.md`                     |
| Create | `.claude/skills/kata-metrics/references/csv-schema.md`     |
| Create | `.claude/skills/kata-metrics/references/control-charts.md` |

## Steps

### 1. Create SKILL.md

Create `.claude/skills/kata-metrics/SKILL.md` with:

**Frontmatter:**

```yaml
---
name: kata-metrics
description: >
  Time-series data recording protocol for Kata agents. Defines CSV schema,
  storage conventions, and metric design guidance. Utility skill — no agent
  routes to it directly; entry-point skills reference it for recording.
---
```

**Content (~80 lines):**

- `# Metrics Recording Protocol` heading
- Brief introduction: utility skill like kata-gh-cli — defines the protocol that
  entry-point skills follow when recording time-series data at the end of each
  run.
- `## When to Use` — You are an entry-point kata skill recording measurements
  after completing primary work. Reference this protocol for format, storage,
  and design guidance.
- `## Recording Protocol` — Step-by-step:
  1. Choose which metrics to record based on what you observed during this run
     (informed by your skill's `references/metrics.md`).
  2. For each metric, append one CSV row to
     `wiki/metrics/{agent}/{domain}/{YYYY}.csv`. Create the directory and header
     row if the file does not exist.
  3. Commit metrics files as part of the wiki push at the end of the run.
- `## Metric Design Guidance` — Brief section:
  - Prefer counts and durations over ratios (ratios hide volume).
  - Prefer direct measurements over derived values.
  - Keep metric names stable across runs (snake_case, descriptive).
  - One metric per measurement — do not pack multiple values into one row.
- `## Storage` — `wiki/metrics/{agent}/{domain}/{YYYY}.csv`. Agent matches
  profile name. Domain matches skill domain slug (e.g., `audit`, `triage`,
  `release-readiness`). Partitioned by year. First line of each new file is the
  header row.
- `## CSV Format` — Brief pointer: see `references/csv-schema.md` for field
  definitions, types, and appending rules.
- `## Process Behavior Charts` — Brief pointer: see
  `references/control-charts.md` for XmR chart guidance.

### 2. Create csv-schema.md

Create `.claude/skills/kata-metrics/references/csv-schema.md` with:

**Content (~60 lines):**

- `# CSV Schema` heading
- Long format, one row per data point. Six fields:

  | Field  | Type          | Required | Example                          |
  | ------ | ------------- | -------- | -------------------------------- |
  | date   | ISO 8601 date | yes      | `2026-04-14`                     |
  | metric | string        | yes      | `open_vulnerabilities`           |
  | value  | number        | yes      | `3`                              |
  | unit   | string        | yes      | `count`, `days`, `minutes`       |
  | run    | string        | yes      | GitHub Actions run URL           |
  | note   | string        | no       | Anomaly annotation (empty if ok) |

- **Header row:** `date,metric,value,unit,run,note` — written as the first line
  when creating a new file.
- **Appending rules:**
  - Always append — never rewrite or sort existing rows.
  - One row per metric per run. If recording three metrics, append three rows.
  - Empty `note` field: leave empty (not null, not "none"), resulting in a
    trailing comma.
  - Quote fields containing commas using double quotes.
- **Example:**
  ```csv
  date,metric,value,unit,run,note
  2026-04-14,open_vulnerabilities,3,count,https://github.com/forwardimpact/monorepo/actions/runs/12345,
  2026-04-14,days_since_topic_audit,7,days,https://github.com/forwardimpact/monorepo/actions/runs/12345,
  2026-04-15,open_vulnerabilities,2,count,https://github.com/forwardimpact/monorepo/actions/runs/12400,resolved CVE-2026-1234
  ```

### 3. Create control-charts.md

Create `.claude/skills/kata-metrics/references/control-charts.md` with:

**Content (~80 lines):**

- `# Process Behavior Charts (XmR)` heading
- Brief introduction: XmR (individuals and moving range) charts are the standard
  tool for distinguishing stable processes from those reacting to special
  causes. They use the data itself to compute natural process limits — no
  external targets needed.
- `## Construction`:
  1. **X chart (individuals):** Plot each measurement value in time order.
     Compute the average (X̄) as the central line.
  2. **mR chart (moving range):** Compute the absolute difference between
     consecutive measurements. Compute the average moving range (m̄R).
  3. **Natural Process Limits (NPL):** Upper NPL = X̄ + 2.66 × m̄R. Lower NPL = X̄
     − 2.66 × m̄R (or 0 if negative for counts).
  4. **Plot.** X chart with X̄ and NPLs. mR chart with m̄R and Upper Range Limit
     (URL = 3.27 × m̄R).
- `## Reading the chart`:
  - **Within limits, no patterns** → stable/predictable process. Variation is
    routine. Do not react to individual points.
  - **Point outside NPL** → signal (special cause). Investigate what changed.
  - **Run of 8+ on same side of central line** → signal. Process has shifted.
  - **Trend of 6+ consecutive increases or decreases** → signal.
- `## Guidance for agents`:
  - Build charts mentally or in markdown tables when reviewing metrics during
    storyboard meetings.
  - Minimum 10-15 data points before computing meaningful limits.
  - When a signal appears, annotate the CSV `note` field with what you discover.
  - Do not set targets based on NPLs — they describe what the process _does_,
    not what it _should_ do. Target conditions come from the storyboard.

## Verification

1. `bun run check` passes (prettier formatting).
2. All three files exist at the specified paths.
3. SKILL.md is under 100 lines (well within the ~200 line budget).
4. csv-schema.md and control-charts.md are self-contained references.

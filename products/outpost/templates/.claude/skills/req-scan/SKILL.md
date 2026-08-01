---
name: req-scan
description: >
  Scan publicly available sources for candidates who indicate they are open for
  hire. Uses WebFetch to read public APIs (HN Algolia, GitHub, dev.to).
  Writes prospect notes to Knowledge/Prospects/. Maintains
  cursor/dedup state in ~/.cache/fit/outpost/head-hunter/. Use when the
  scheduler wakes the head-hunter agent or when the user asks to scan for open
  candidates.
---

# Scan Open Candidates

Fetch and filter publicly available candidate posts from platforms where people
**explicitly indicate** they are open for hire. This skill fetches, filters,
deduplicates, benchmarks, writes prospect notes, and updates memory.

## Trigger

- The scheduler wakes the head-hunter agent.
- The user asks to scan for open candidates or prospects.

## Prerequisites

- `WebFetch` tool available (a Claude Code built-in, no curl/wget).
- `fit-pathway` CLI available (`bunx fit-pathway`).
- Memory directory `~/.cache/fit/outpost/head-hunter/`.

## Inputs

- `~/.cache/fit/outpost/head-hunter/cursor.tsv` — source rotation.
- `~/.cache/fit/outpost/head-hunter/seen.tsv` — deduplication.
- Standard data via `bunx fit-pathway skill --list` and `bunx fit-pathway job`.

## Outputs

- `Knowledge/Prospects/{Name}.md`.
- Updated `cursor.tsv`, `seen.tsv`, `prospects.tsv`, and `log.md`.
- `~/.cache/fit/outpost/state/head_hunter_triage.md`.

<do_confirm_checklist goal="Verify the wake produced a clean, ethical scan">

- [ ] Select the least-recently-checked source that is not suspended.
- [ ] Fetch with `WebFetch` (never curl/wget).
- [ ] Apply all 5 filters in order. Confirm each passed candidate has ≥ 2
      standard-relevant skills.
- [ ] Deduplicate against `seen.tsv` before you process a candidate.
- [ ] Benchmark each prospect against a real `bunx fit-pathway job`.
- [ ] Follow the template for every prospect note (no fabricated names).
- [ ] Route every state mutation through `node scripts/state.mjs`: cursor,
      seen, prospects, failures, log.
- [ ] Write the triage report to the state directory. Log any alternative
      queries.
- [ ] Record every failure. Suspend a source at ≥ 3 consecutive failures.

</do_confirm_checklist>

## Procedure

### 1. Pick a source

```bash
node scripts/state.mjs cursor list
```

Pick the least-recently-checked source. Skip suspended sources (`failure get` ≥
3). If all are suspended, report it in the triage and exit. Source URLs and
parse fields: [references/sources.md](references/sources.md).

### 2. Fetch and scan

Use `WebFetch` per [references/sources.md](references/sources.md). On failure,
follow [references/filters.md](references/filters.md#failure-handling).

### 3. Filter

Apply the 5-filter pipeline in
[references/filters.md](references/filters.md#filter-pipeline): signal, dedup,
geographic, skill alignment, experience level.

### 3b. Fallback — zero new prospects

If the filters eliminate every candidate, try up to **3 alternatives** per wake
from [references/fallbacks.md](references/fallbacks.md). Log every alternative
in `log.md`.

### 4. Benchmark and write prospect notes

For each candidate that passes filters, benchmark:

```bash
bunx fit-pathway job {discipline} {estimated_level} --track={best_track}
```

Classify match strength:

- **strong** — multiple core skills match, level aligns, location works, plus
  non-traditional signals for forward-deployed.
- **moderate** — some overlap, level roughly right, minor gaps.
- **weak** — few matching signals, significant gaps.

Write notes for **strong** and **moderate** matches only. Use the template in
[references/template.md](references/template.md).

```bash
mkdir -p "Knowledge/Prospects"
```

### 5. Update state

All state changes go through `node scripts/state.mjs`. The full command
reference is [references/state.md](references/state.md). Each wake:

1. Update the cursor (`cursor set`).
2. Reset failure count on success or increment on failure.
3. Append every processed post ID to `seen` (`seen batch` for many).
4. Add new prospects (`prospect add`).
5. Append the wake summary (`log-wake`).

### 6. Write the triage report

Save to `~/.cache/fit/outpost/state/head_hunter_triage.md`:

```markdown
# Head Hunter Triage — {YYYY-MM-DD HH:MM}

## Last Scan
Source: {source_id} ({description})
Posts scanned: {N}
New prospects: {N}
Skipped: {N} (dedup: {N}, location: {N}, skill fit: {N})
Alternative queries tried: {N} ({list, or "none needed"})

## Pipeline Summary
Total prospects: {N} (strong: {N}, moderate: {N})
Sources checked today: {list}
Oldest unchecked source: {source_id} (last: {date})
Suspended sources: {list with failure counts, or "none"}

## Recent Prospects
- **{Name}** — {match_strength}, {estimated_level} {track}, {location}

## Retention
{List prospects older than 90 days not acted on, if any.}
```

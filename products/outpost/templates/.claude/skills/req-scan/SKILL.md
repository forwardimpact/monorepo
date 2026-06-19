---
name: req-scan
description: >
  Scan publicly available sources for candidates who indicate they are open for
  hire. Uses WebFetch to read public APIs (HN Algolia, GitHub, dev.to).
  Writes prospect notes to Knowledge/Prospects/. Maintains
  cursor/dedup state in ~/.cache/fit/outpost/head-hunter/. Use when the
  head-hunter agent is woken or when the user asks to scan for open candidates.
---

# Scan Open Candidates

Fetch and filter publicly available candidate posts from platforms where people
**explicitly indicate** they are open for hire. This skill handles fetching,
filtering, deduplication, benchmarking, prospect-note writing, and memory
updates.

## Trigger

- The head-hunter agent is woken by the scheduler.
- The user asks to scan for open candidates or prospects.

## Prerequisites

- `WebFetch` tool available (Claude Code built-in — no curl/wget).
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

- [ ] Selected the least-recently-checked, non-suspended source.
- [ ] Fetched via `WebFetch` (never curl/wget).
- [ ] Applied all 5 filters in order; passed candidates have ≥ 2
      standard-relevant skills.
- [ ] Deduplicated against `seen.tsv` before processing.
- [ ] Benchmarked each prospect against a real `bunx fit-pathway job`.
- [ ] Prospect notes follow the template (no fabricated names).
- [ ] All state mutations went through `node scripts/state.mjs` — cursor, seen,
      prospects, failures, log.
- [ ] Triage report written to the state directory; alternative queries (if any)
      logged.
- [ ] Failures recorded; sources with ≥ 3 consecutive failures suspended.

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
[references/filters.md](references/filters.md#filter-pipeline) — signal, dedup,
geographic, skill alignment, experience level.

### 3b. Fallback — zero new prospects

If filtering eliminates every candidate, try up to **3 alternatives** per wake
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

Write notes for **strong** and **moderate** matches only, using the template in
[references/template.md](references/template.md).

```bash
mkdir -p "Knowledge/Prospects"
```

### 5. Update state

All state changes go through `node scripts/state.mjs` — full command reference:
[references/state.md](references/state.md). Each wake:

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

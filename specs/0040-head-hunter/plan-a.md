# Head Hunter Agent — Implementation Plan

## Summary

A passive talent scouting agent for the Basecamp template that scans publicly
available sources for candidates who explicitly indicate they are open for hire,
benchmarks them against fit-pathway engineering jobs, and writes prospect notes.
The agent never contacts candidates.

## Files Changed

### New Files

| File                                                                      | Purpose                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `products/basecamp/template/.claude/agents/head-hunter.md`                | Agent definition with ethics rules, framework reference, memory layout, source rotation, and triage reporting |
| `products/basecamp/template/.claude/skills/scan-open-candidates/SKILL.md` | Skill for fetching and filtering public candidate data via WebFetch                                           |

### Modified Files

| File                                               | Change                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `products/basecamp/config/scheduler.json`          | Added `head-hunter` agent entry (60-minute interval)                                       |
| `products/basecamp/template/.claude/settings.json` | Added WebFetch domain permissions for hn.algolia.com, hachyderm.io, dev.to, www.reddit.com |
| `products/basecamp/template/CLAUDE.md`             | Added head-hunter to agent table, triage files, cache layout, and skills table             |

## Architecture

### Agent Lifecycle

```
Scheduler (every 60 min)
  → Wake head-hunter agent
    → Initialize memory (first run only)
    → Select least-recently-checked source (round-robin)
    → WebFetch public API for that source
    → Filter: open-for-hire → dedup → location → skills → level
    → Benchmark matches against fit-pathway jobs
    → Write prospect notes to knowledge/Prospects/
    → Update memory files (cursor, seen, prospects, log)
    → Write triage report to state directory
    → Output Decision/Action summary
```

### Data Sources

| Source                      | API                          | Signal                                                |
| --------------------------- | ---------------------------- | ----------------------------------------------------- |
| HN "Who Wants to Be Hired?" | hn.algolia.com/api/v1        | Monthly thread — candidates self-post availability    |
| Mastodon (Hachyderm.io)     | hachyderm.io/api/v1          | #GetFediHired, #HachyJobs hashtags                    |
| dev.to                      | dev.to/api                   | Listings (collabs) and articles tagged lookingforwork |
| Reddit r/forhire            | reddit.com/r/forhire/\*.json | [For Hire] flair posts                                |

All sources are unauthenticated public APIs. The agent uses Claude Code's
built-in `WebFetch` tool (not curl/wget, which are denied in settings).

### Memory System

All state persists in `~/.cache/fit/basecamp/head-hunter/` as TSV and markdown
files, searchable and editable with standard Unix tools:

| File            | Format                                           | Purpose                               |
| --------------- | ------------------------------------------------ | ------------------------------------- |
| `cursor.tsv`    | `source<TAB>last_checked<TAB>cursor_id`          | Source rotation and pagination state  |
| `seen.tsv`      | `source<TAB>post_id<TAB>date`                    | Deduplication — prevents reprocessing |
| `prospects.tsv` | `name<TAB>source<TAB>date<TAB>strength<TAB>role` | Quick prospect index                  |
| `log.md`        | Markdown sections by date                        | Append-only activity log              |

### Filtering Pipeline

1. **Open-for-hire signal** — Only candidates who explicitly opt in (thread
   participation, hashtags, flair)
2. **Deduplication** — Skip posts already in `seen.tsv`
3. **Geographic fit** — US East Coast, UK, EU (Greece, Poland, Romania,
   Bulgaria), Remote
4. **Skill alignment** — At least 2 framework-relevant skills from fit-pathway
5. **Experience level** — Estimate J040–J110 from signals in the post

### Output

Prospect notes follow the existing `knowledge/Candidates/` convention but live
in a `Prospects/` subdirectory to distinguish them from recruiter-sourced
candidates:

```
knowledge/Prospects/{Name}.md
```

Each note includes: source link, estimated level, track fit, match strength,
framework skill alignment, and a brief profile summary.

## Ethics & Privacy

- Public data only — no authentication, no gated content
- Open-for-hire signals required — never prospect unwilling candidates
- No contact — the agent recommends, the user decides
- Minimum necessary data — only role-relevant information
- 90-day retention flag for unacted prospects
- GDPR-compatible — erasure via existing right-to-be-forgotten skill

## Design Decisions

1. **WebFetch over curl** — The settings.json denies curl/wget. WebFetch is a
   Claude Code built-in tool that doesn't need shell access. This is also more
   secure — the permission model controls which domains are reachable.

2. **TSV over JSON for memory** — TSV files are trivially searchable with grep,
   awk, cut, sort, and other Unix tools. This matches the "simple text files
   manageable with CLI tools" requirement. No parsing libraries needed.

3. **Round-robin source rotation** — Each wake scans one source. With a 60-min
   interval and 4 sources, each source is checked roughly every 4 hours. This
   keeps each wake fast and focused.

4. **Prospects/ subdirectory** — Separates passively-scouted prospects from
   recruiter-sourced candidates. The recruiter agent works with
   `knowledge/Candidates/{Name}/brief.md`; the head hunter writes to
   `knowledge/Prospects/{Name}.md`. No collision.

5. **60-minute interval** — Generous schedule since public sources update slowly
   (HN monthly, Mastodon/Reddit/dev.to a few times per day). Avoids unnecessary
   API calls.

6. **Agent uses sonnet model** — Matches the pattern of other Basecamp agents.
   Source scanning and skill matching don't require the most capable model.

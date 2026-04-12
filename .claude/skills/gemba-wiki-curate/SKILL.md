---
name: gemba-wiki-curate
description: >
  Curate the wiki (agent memory) for cross-team collaboration. Verify summary
  accuracy against weekly logs, follow up on stale teammate observations,
  update MEMORY.md, and clean log hygiene. Use when running scheduled wiki
  curation, auditing agent memory health, or checking cross-agent
  communication.
---

# Wiki Curation

Ensure the wiki remains a reliable coordination mechanism. Without curation,
summaries drift from reality, stale blockers persist, critical observations go
unacted on, and MEMORY.md falls out of sync.

Each run covers all four curation areas in sequence.

## When to Use

- Scheduled wiki curation run
- Auditing agent memory health
- Checking cross-agent communication

## Curation areas

| Area                    | What to check                                                  |
| ----------------------- | -------------------------------------------------------------- |
| `summary-accuracy`      | Each agent's summary matches their latest weekly log entries   |
| `observation-follow-up` | "Observations for teammates" are acknowledged and acted on     |
| `memory-index`          | MEMORY.md and Home.md list all agents, conventions are current |
| `log-hygiene`           | Weekly logs use correct format, headings, ISO week conventions |

If time-constrained, prioritize `summary-accuracy` and `observation-follow-up`.

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Then read every file in `wiki/`:

- All agent summary files (`wiki/<agent>.md`)
- The current week's log for each agent (`wiki/<agent>-$(date +%G-W%V).md`)
- `wiki/MEMORY.md`
- `wiki/Home.md`

### Step 1: Summary accuracy

For each agent, compare the summary against the most recent weekly log entries:

- **Last run date** — Does the summary's "Last run" match the latest
  `## YYYY-MM-DD` entry in their weekly log?
- **Coverage map** — Does the summary's coverage table match the data in their
  latest log entries? (Applies to agents with coverage maps: security-engineer,
  improvement-coach, technical-writer.)
- **Blockers** — Are blockers in the summary still open, or were they resolved
  in subsequent logs? Remove resolved blockers.
- **Stale summaries** — Flag any agent whose summary shows a "Last run" date
  more than 7 days ago with no new weekly log entries.

Fix inaccuracies directly in the summary files.

### Step 2: Observation follow-up

Collect all "Observations for teammates" sections across all agent summaries.
For each observation:

1. Identify the target agent.
2. Check the target agent's weekly logs after the observation date for
   acknowledgement or action.
3. Flag observations older than 2 weeks with no visible response.
4. Note unacted observations in the technical-writer's own summary so the target
   agent sees them on their next run.

### Step 3: Memory index

Verify `wiki/MEMORY.md`:

- Lists all agents with correct one-line descriptions.
- Filename convention documentation matches actual usage.
- No agents missing or extra.

Verify `wiki/Home.md`:

- Agent count matches actual agents.
- All agent summary links work.
- Quick links are current.

Update both files if they've drifted.

### Step 4: Log hygiene

For each weekly log file in `wiki/`:

- Filename follows `<agent>-YYYY-Www.md` convention.
- File starts with `# <Agent Name> — YYYY-Www` heading.
- Each run entry uses `## YYYY-MM-DD` heading.
- Subsections use `###` headings matching the skill's "Memory: what to record"
  fields.

Flag format violations but do not rewrite log content — logs are historical
records.

### Step 5: Critical item roll-up

Scan all agent summaries and recent weekly logs for items that affect multiple
agents or the whole team:

- Systemic blockers (e.g., CI failures, SDK limitations)
- Breaking changes that affect agent workflows
- Policy changes that need cross-agent awareness

Ensure these appear in MEMORY.md under a visible section, or in every affected
agent's summary under "Observations for teammates."

## Output

- **Direct wiki fixes** — Summary corrections, MEMORY.md updates, stale blocker
  removal. Commit directly to the wiki submodule.
- **Cross-agent observations** — Note unacted teammate observations in the
  technical-writer's summary for target agents to see.
- **Structural improvements** — Spec via `gemba-spec` if the wiki structure
  itself needs redesign.

### Publishing changes

Wiki changes are not visible to other agents until pushed. After committing:

1. **Push the wiki submodule** — `cd wiki && git push origin HEAD:master`
2. **Commit and push the submodule pointer** — back in the monorepo root, stage
   the `wiki` submodule pointer, commit as `chore: update wiki submodule`, and
   push to `main`.

If the curation also produced monorepo fixes (e.g., stale spec STATUS, doc
corrections), branch from `main` as `fix/wiki-curate-YYYY-MM-DD`, commit, push,
and open a PR — same discipline as doc-review fixes.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Areas curated** — Which areas checked
- **Summary corrections** — Which agent summaries were updated and why
- **Stale observations** — Teammate observations >2 weeks old with no response
- **MEMORY.md changes** — What was added/updated
- **Observations for teammates** — Specific callouts based on wiki findings

# 190: CI Agent Shared Memory via GitHub Wiki

## Problem

The CI agents (release-engineer, security-engineer, improvement-coach,
product-manager) are stateless — each workflow run starts from scratch with no
knowledge of what happened in previous runs or what teammate agents discovered.
This limits their effectiveness: agents repeat investigations, miss patterns
across runs, and cannot build on each other's findings.

## Why

- **Redundant work** — Agents re-investigate the same PRs, dependencies, and CI
  failures that previous runs already handled.
- **Lost institutional knowledge** — Patterns discovered during trace analysis,
  security findings, and release decisions evaporate after each run.
- **No team coordination** — The security engineer cannot tell the release
  engineer about a problematic dependency; the improvement coach cannot leave
  notes for future coaching cycles.
- **GitHub wiki is the right medium** — It's a git repo (versioned, auditable),
  lives outside the workspace (no contamination), requires no additional
  infrastructure, and is already available on every GitHub repository.

## What

Three changes:

1. **Enhanced composite action** (`.github/actions/claude/action.yml`) — Add a
   `wiki` input parameter (boolean, default `true`). When enabled, clone the
   repo's GitHub wiki before running Claude, configure `autoMemoryDirectory` in
   a project-level settings override, and commit/push wiki changes after Claude
   finishes.

2. **Agent profile updates** (`.claude/agents/*.md`) — Add memory-writing
   instructions to all four agent profiles so they actively record observations,
   decisions, and status in memory files.

3. **Documentation update** (`CONTINUOUS_IMPROVEMENT.md`) — Add a section
   describing the shared memory architecture.

## Scope

### In scope

- New `wiki` input on `.github/actions/claude/action.yml`
- Wiki clone/push steps in the composite action
- Settings override for `autoMemoryDirectory`
- Memory-writing instructions in all 4 agent profiles
- Documentation in `CONTINUOUS_IMPROVEMENT.md`

### Out of scope

- Changes to any workflow files (they inherit the new default automatically)
- Changes to skills
- Wiki page structure beyond what autoMemory creates
- Custom memory tools or scripts

## Design

### How it works

```
Workflow run starts
  │
  ├─ Clone {repo}.wiki.git to /tmp/wiki
  │    └─ Initialize if wiki doesn't exist yet
  │
  ├─ Merge autoMemoryDirectory into .claude/settings.json
  │    └─ Points to /tmp/wiki
  │
  ├─ Run Claude Code (agent reads/writes memory via autoMemoryDirectory)
  │
  └─ Commit and push /tmp/wiki changes
       └─ Non-fatal — push failure does not fail the workflow
```

All agents share one wiki. Each agent writes memory files that persist across
runs and are visible to every other agent. Claude Code's `autoMemoryDirectory`
setting tells it where to read and write these files automatically.

### Wiki push permissions

The wiki clone and push uses `GH_TOKEN` (the `CLAUDE_GH_TOKEN` secret) which
already has `contents: write` scope on all workflows except `security-audit`.
For `security-audit` (which has `contents: read`), the GH_TOKEN as a PAT should
still work for wiki operations since the wiki is a separate repository. If not,
the `wiki` parameter can be set to `false` for that workflow.

### What agents record

Each agent writes to memory at the end of every run:

- **Actions taken** — What was done this run
- **Decisions and rationale** — Why a particular action was chosen
- **Observations for teammates** — Context other agents would benefit from
- **Blockers and deferred work** — Issues that could not be resolved

Plus agent-specific context: release versions cut, CVEs evaluated, traces
analyzed, PRs triaged, and contributor trust decisions.

## Files to modify

| File                                  | Change                                       |
| ------------------------------------- | -------------------------------------------- |
| `.github/actions/claude/action.yml`   | Add `wiki` input, clone/configure/push steps |
| `.claude/agents/release-engineer.md`  | Add Memory section                           |
| `.claude/agents/security-engineer.md` | Add Memory section                           |
| `.claude/agents/improvement-coach.md` | Add Memory section                           |
| `.claude/agents/product-manager.md`   | Add Memory section                           |
| `CONTINUOUS_IMPROVEMENT.md`           | Add Shared Memory section                    |

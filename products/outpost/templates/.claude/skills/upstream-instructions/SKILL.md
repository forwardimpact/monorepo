---
name: upstream-instructions
description: Track changes made to this installation's instruction files — the root CLAUDE.md, agent profiles, and skills — and record them in a single root CHANGELOG.md so improvements can be contributed back to the upstream monorepo. Use when CLAUDE.md, agents, or skills have been modified, added, or removed locally and those changes should be documented for upstream.
---

# Upstream Instructions

Track changes to this installation's **instructions** and record them in one
root `CHANGELOG.md` so improvements can be contributed back to the upstream
monorepo. "Instructions" means all three surfaces, treated equally:

- **`CLAUDE.md`** (root) — installation-wide instructions.
- **`.claude/agents/*.md`** — agent profiles.
- **`.claude/skills/*/`** — skills (`SKILL.md` and reference files).

## Trigger

- The user asks to prepare local instruction changes for upstream contribution.
- The root `CLAUDE.md`, an agent profile, or a skill has been modified, added,
  or removed.
- The user wants to document what changed locally before syncing upstream.

## Prerequisites

- A working Outpost installation with `CLAUDE.md`, `.claude/agents/`, and
  `.claude/skills/`.
- Git available for change detection.

## Inputs

- `CLAUDE.md` — root installation instructions.
- `.claude/agents/*.md` — agent profiles.
- `.claude/skills/*/SKILL.md` and reference files — skills.
- `CHANGELOG.md` (root) — the existing changelog, for the last documented date.
- Git history and working tree — change detection.

## Outputs

- `CHANGELOG.md` (root) — a **single** reverse-chronological changelog covering
  all three surfaces. There are no per-skill or per-agent changelogs.

<do_confirm_checklist goal="Verify the changelog is upstream-ready">

- [ ] Exactly one root `CHANGELOG.md`; no stray per-skill / per-agent changelogs
      left behind.
- [ ] Every entry names its **Scope** (which surface(s) and file(s) it touched).
- [ ] Each entry has **What**, **Why**, and **Details**.
- [ ] Descriptions are specific enough for an upstream maintainer to act on (not
      "updated CLAUDE.md" / "fixed stuff").
- [ ] New skills/agents include a brief description of their purpose; removed
      ones explain why.
- [ ] Dates come from git history (or the date the change was made for
      uncommitted edits), not guessed.
- [ ] No duplicate entries for the same change.

</do_confirm_checklist>

## Procedure

### 1. Find the last documented state

```bash
head -20 CHANGELOG.md 2>/dev/null   # newest date already recorded, if any
```

### 2. Identify changed instructions

Detect changes across all three surfaces — committed and uncommitted:

```bash
# Committed changes since the last documented date (or all history)
git log --after="<last-entry-date>" --name-status -- \
  CLAUDE.md '.claude/agents/' '.claude/skills/'

# Uncommitted working-tree changes (common in a live installation)
git status --short -- CLAUDE.md '.claude/agents/' '.claude/skills/'
```

If no `CHANGELOG.md` exists yet, consider all changes since the initial commit.

### 3. Classify each change

| Surface       | What it covers                                  |
| ------------- | ----------------------------------------------- |
| `CLAUDE.md`   | Root installation instructions                  |
| `agent:<name>`| A profile in `.claude/agents/`                  |
| `skill:<name>`| A skill in `.claude/skills/`                    |

| Type       | Description                                            |
| ---------- | ------------------------------------------------------ |
| `added`    | New instruction file that doesn't exist upstream       |
| `modified` | Existing instruction updated                           |
| `removed`  | Instruction file or directory deleted                  |
| `renamed`  | File or directory renamed                              |

A single change often spans surfaces (e.g. a KB-structure change touching
`CLAUDE.md`, several agents, and several skills) — record it as **one entry**
whose Scope lists every surface touched. Diff to confirm the actual change:

```bash
git diff <commit> -- CLAUDE.md
git diff <commit> -- '.claude/agents/<agent>.md'
git diff <commit> -- '.claude/skills/<skill>/'
```

### 4. Describe each change

Every entry must answer:

1. **What changed?** — the specific instruction or behaviour modified.
2. **Why?** — the problem encountered or improvement discovered in use.
3. **Details** — a summary of the actual change (not a full diff).

Good: "Agents now read `Knowledge/Priorities/` at the start of every wake and
flag anything that threatens a priority — drafts and triage were ignoring
strategic context."

Bad: "Updated the agents" / "Fixed stuff" / "Changed line 42".

### 5. Write the changelog

Create or update the single root `CHANGELOG.md` (newest first):

```markdown
# Outpost Instructions Changelog

Changes to this installation's instructions — root `CLAUDE.md`, agent profiles
(`.claude/agents/`), and skills (`.claude/skills/`) — for consideration upstream
in the Forward Impact monorepo. Documents only; pushes nothing.

## <YYYY-MM-DD>

**Scope:** <surfaces/files, e.g. "skill: extract-entities; CLAUDE.md; agents: librarian, recruiter">
**Type:** <added | modified | removed | renamed>

**What:** <one-line summary>

**Why:** <problem or improvement that motivated it>

**Details:**
<2–6 lines describing the specific changes across the listed surfaces>

---
```

Worked examples in [references/examples.md](references/examples.md).

## Notes

- This skill **documents only** — it does not push or merge anything.
- The single root `CHANGELOG.md` is consumed by the **downstream-instructions**
  skill in the upstream monorepo.
- When in doubt about whether a change is upstream-worthy, include it; the
  upstream maintainer decides what to incorporate.

---
name: upstream-instructions
description: Track changes to this installation's instruction files: the root CLAUDE.md, agent profiles, and skills. Record them in a single root CHANGELOG.md so you can contribute improvements back to the upstream monorepo. Use when someone modified, added, or removed CLAUDE.md, agents, or skills locally and you should document those changes for upstream.
---

# Upstream Instructions

Write tier: none (the root CHANGELOG.md is a personal surface)
Frontmatter: none

Track changes to this installation's **instructions**. Record them in one root
`CHANGELOG.md` so you can contribute improvements back to the upstream monorepo.
"Instructions" means all three surfaces, and they carry equal weight:

- **`CLAUDE.md`** (root) — installation-wide instructions.
- **`.claude/agents/*.md`** — agent profiles.
- **`.claude/skills/*/`** — skills (`SKILL.md` and reference files).

## Trigger

- The user asks to prepare local instruction changes for upstream contribution.
- Someone modified, added, or removed the root `CLAUDE.md`, an agent profile, or
  a skill.
- The user wants to document what changed locally before the sync upstream.

## Prerequisites

- A working Outpost installation with `CLAUDE.md`, `.claude/agents/`, and
  `.claude/skills/`.

## Inputs

- `CLAUDE.md` — root installation instructions.
- `.claude/agents/*.md` — agent profiles.
- `.claude/skills/*/SKILL.md` and reference files — skills.
- `CHANGELOG.md` (root) — the existing changelog, for what's already recorded.
- The changes you made in the current working session — the source of truth for
  what changed. The KB may sync without version control; do not rely on it.

## Outputs

- `CHANGELOG.md` (root) — a **single** reverse-chronological changelog that
  covers all three surfaces. There are no per-skill or per-agent changelogs.

<do_confirm_checklist goal="Verify the changelog is upstream-ready">

- [ ] Keep exactly one root `CHANGELOG.md`. Leave no stray per-skill or
      per-agent changelog behind.
- [ ] Name the **Scope** in every entry (the surfaces and files it touched).
- [ ] Give each entry **What**, **Why**, and **Details**.
- [ ] Make each description specific enough for an upstream maintainer to act
      on. Never write "updated CLAUDE.md" or "fixed stuff".
- [ ] Briefly describe the purpose of each new skill or agent. Explain why you
      removed each deleted one.
- [ ] Use the real date of the change. Never guess a date.
- [ ] Write no duplicate entry for the same change.

</do_confirm_checklist>

## Procedure

### 1. Find the last documented state

```bash
head -20 CHANGELOG.md 2>/dev/null   # newest date already recorded, if any
```

### 2. Identify changed instructions

A knowledge base may sync over a mount with no version control, so never rely
on commit history. Identify what changed from the work you did **this
session**. Recall every edit, addition, removal, and rename you made to
`CLAUDE.md`, `.claude/agents/`, and `.claude/skills/` during the current
conversation. List them per surface.

Use `CHANGELOG.md` only to see what it already records. Do not duplicate an
existing entry. If something clearly changed but you cannot
reconstruct what or why from the session, flag it for review. Do not guess.

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

A single change often spans surfaces. For example, a KB-structure change touches
`CLAUDE.md`, several agents, and several skills. Record it as **one entry**
whose Scope lists every surface it touched. Before you describe the change,
re-read the affected files and confirm it landed as intended.

### 4. Describe each change

Every entry must answer:

1. **What changed?** — the specific instruction or behaviour modified.
2. **Why?** — the problem encountered or improvement discovered in use.
3. **Details** — a summary of the actual change (not a full diff).

Good: "Agents now read `Priorities/` in every tier at the start of every wake
and flag anything that threatens a priority. Drafts and triage ignored strategic
context."

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

- This skill **documents only**. It does not push or merge anything.
- The **downstream-instructions** skill in the upstream monorepo consumes the
  single root `CHANGELOG.md`.
- When in doubt about whether a change is upstream-worthy, include it. The
  upstream maintainer decides what to incorporate.

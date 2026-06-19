---
name: downstream-instructions
description: Study downstream Outpost installations, read their single root instruction changelog, and bring improvements upstream into the monorepo template across all three surfaces — root CLAUDE.md, agent profiles, and skills. Use when incorporating field-tested instruction changes from installations back into the canonical Outpost template.
---

# Downstream Instructions

Study downstream Outpost installations, read the **single root `CHANGELOG.md`**
each one produces, and bring field-tested improvements upstream into the
monorepo's Outpost template. "Instructions" means all three surfaces, treated
equally — the same surfaces the downstream **upstream-instructions** skill
tracks. Each maps to its counterpart under `products/outpost/templates/`:
root `CLAUDE.md`, `.claude/agents/*.md` (agent profiles), and
`.claude/skills/*/` (skills — `SKILL.md` and references).

## Trigger

Run this skill when:

- The user asks to check downstream installations for instruction changes
- The user wants to incorporate field-tested improvements from installations
- Periodically reviewing what downstream users have changed in their CLAUDE.md,
  agents, or skills

## Prerequisites

- Access to downstream installation directories
- The downstream installation has run the **upstream-instructions** skill to
  produce a root `CHANGELOG.md`

## Downstream Installations

| Installation | Path                    |
| ------------ | ----------------------- |
| Personal     | `~/Documents/Personal/` |

## Inputs

- `<installation>/CHANGELOG.md` — the **single** root changelog produced by the
  upstream-instructions skill, covering all three surfaces. There are no
  per-skill or per-agent changelogs.
- `<installation>/CLAUDE.md`, `<installation>/.claude/agents/*.md`,
  `<installation>/.claude/skills/*/` — the current instruction files, for
  comparing the actual change against the changelog description.
- `products/outpost/templates/` — the canonical template (`CLAUDE.md`,
  `.claude/agents/`, `.claude/skills/`) in this monorepo.

## Outputs

- Updated template surfaces under `products/outpost/templates/` —
  `CLAUDE.md`, `.claude/agents/`, and/or `.claude/skills/`.
- Updated capability data in `data/pathway/capabilities/` (when changes affect
  agent skill definitions).
- Summary of what was incorporated and what was deferred.

---

## Process

### Step 1: Read the Root Changelog

For each downstream installation, read its single root `CHANGELOG.md`.

If no `CHANGELOG.md` exists, the installation hasn't run the
**upstream-instructions** skill yet. Report this and stop — do not try to infer
changes without a structured changelog.

### Step 2: Identify Unprocessed Entries

Read the changelog and identify entries that haven't been processed yet. Track
processing state in `wiki/downstream-instructions.md`. Record what was reviewed,
what was incorporated, and what was deferred.

For each unprocessed entry, record:

- **Scope** — which surface(s) and file(s) it touched (`CLAUDE.md`,
  `agent:<name>`, `skill:<name>`); a single entry may span several
- **Type** — added / modified / removed / renamed
- **What** changed and **Why**
- The **date** of the change

### Step 3: Evaluate Each Change

For each unprocessed entry, evaluate whether it should be brought upstream. Read
both the changelog description and the actual files in the installation, then
compare with the canonical template:

```bash
# The changed file(s) in the installation
cat ~/Documents/Personal/CLAUDE.md
cat ~/Documents/Personal/.claude/agents/<agent>.md
cat ~/Documents/Personal/.claude/skills/<skill>/SKILL.md

# The canonical template counterpart
cat products/outpost/templates/CLAUDE.md
cat products/outpost/templates/.claude/agents/<agent>.md
cat products/outpost/templates/.claude/skills/<skill>/SKILL.md
```

#### Evaluation Criteria

| Criterion                    | Include upstream?                                      |
| ---------------------------- | ------------------------------------------------------ |
| Fixes a real bug             | Yes — apply the fix                                    |
| Improves a workflow          | Yes — if the improvement is general, not personal      |
| Adds safety checks           | Yes — defensive improvements benefit all installations |
| New skill / agent (general)  | Yes — add to template if useful for most installations |
| New skill / agent (personal) | No — too specific to one user's workflow               |
| Removes a step or surface    | Maybe — understand why, it may indicate a design issue |
| Changes paths / configs      | No — likely installation-specific                      |
| Style-only changes           | No — not worth the churn                               |

Ask: _"Would this change benefit a new Outpost installation, or is it specific
to this user's setup?"_

### Step 4: Apply Upstream Changes

For changes that should be brought upstream, apply them to the matching template
surface. A single changelog entry may touch several surfaces — apply each part
to its counterpart.

**For modified files (CLAUDE.md, agent, or skill):**

Read the downstream version and the template version. Apply the **specific
improvement** described in the changelog — do not blindly overwrite the template
with the downstream file, which may mix installation-specific customizations
with general improvements.

**For new skills or agents:**

Copy the new file or directory into the template, then review for
installation-specific content (hardcoded paths, user names, personal
preferences) and generalize before adding:

```bash
ls ~/Documents/Personal/.claude/skills/<new-skill>/
cat ~/Documents/Personal/.claude/skills/<new-skill>/SKILL.md
```

**For removed surfaces:**

Delete the corresponding file or directory from the template and rewire any
template references that pointed to it (CLAUDE.md layout, agent skill lists).

**For capability data changes:**

If the entry describes changes to agent skill definitions (stages, checklists,
tool references, instructions), also update the capability YAML files:

- `data/pathway/capabilities/{id}.yaml`

After updating capability data, validate:

```bash
bunx fit-map validate
```

### Step 5: Verify Changes

After applying upstream changes:

1. **Diff the template** (`git diff products/outpost/templates/`) to confirm
   only intended changes were made.
2. **Re-run `bunx fit-map validate`** if capability data was changed.
3. **Check for consistency** across surfaces — if a skill, agent, or CLAUDE.md
   changed, ensure related surfaces weren't left inconsistent (e.g., if a skill
   changed its output format, do its consumers still work? If CLAUDE.md dropped
   a directory, did every agent and skill stop referencing it?).

### Step 6: Report

Summarize what was done:

```markdown
## Downstream Sync

### Incorporated
- **<scope>**: <one-line summary of what was brought upstream>

### Deferred
- **<scope>**: <one-line summary> — Reason: <why it was not included>

### No Changelog
- **<installation>**: No root CHANGELOG.md found — upstream-instructions skill
  not yet run
```

### Step 7: Update Memory

Update `wiki/downstream-instructions.md` with what was processed, incorporated,
and deferred. Keep it concise — just enough to avoid re-processing.

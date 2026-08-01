---
name: downstream-instructions
description: Study downstream Outpost installations, read their single root instruction changelog, and bring improvements upstream into the monorepo template across all three surfaces: root CLAUDE.md, agent profiles, and skills. Use when you incorporate field-tested instruction changes from installations back into the canonical Outpost template.
---

# Downstream Instructions

Study downstream Outpost installations. Read the **single root `CHANGELOG.md`**
each one produces. Bring field-tested improvements upstream into the monorepo's
Outpost template. "Instructions" means all three surfaces, treated equally. The
downstream **upstream-instructions** skill tracks the same surfaces. Each maps
to its counterpart under `products/outpost/templates/`: root `CLAUDE.md`,
`.claude/agents/*.md` (agent profiles), and `.claude/skills/*/` (skills, which
are `SKILL.md` and references).

## Trigger

Run this skill when:

- The user asks to check downstream installations for instruction changes
- The user wants to incorporate field-tested improvements from installations
- You periodically review what downstream users changed in their CLAUDE.md,
  agents, or skills

## Prerequisites

- Access to downstream installation directories
- The downstream installation ran the **upstream-instructions** skill to
  produce a root `CHANGELOG.md`

## Downstream Installations

Knowledge bases live under `~/.local/share/fit/outpost/<name>`, one directory
per KB. The default knowledge base is named `Team`.

| Installation | Path                              |
| ------------ | --------------------------------- |
| Team         | `~/.local/share/fit/outpost/Team/` |

## Inputs

- `<installation>/CHANGELOG.md` — the **single** root changelog the
  upstream-instructions skill produces. It covers all three surfaces. There are
  no per-skill or per-agent changelogs.
- `<installation>/CLAUDE.md`, `<installation>/.claude/agents/*.md`,
  `<installation>/.claude/skills/*/` — the current instruction files. Use them
  to compare the actual change against the changelog description.
- `products/outpost/templates/` — the canonical template (`CLAUDE.md`,
  `.claude/agents/`, `.claude/skills/`) in this monorepo.

## Outputs

- Updated template surfaces under `products/outpost/templates/` —
  `CLAUDE.md`, `.claude/agents/`, and/or `.claude/skills/`.
- Updated capability data in `data/pathway/capabilities/` (when changes affect
  agent skill definitions).
- A summary of what you incorporated and what you deferred.

---

## Process

### Step 1: Read the Root Changelog

For each downstream installation, read its single root `CHANGELOG.md`.

If no `CHANGELOG.md` exists, the installation did not run the
**upstream-instructions** skill yet. Report this and stop. Do not try to infer
changes without a structured changelog.

### Step 2: Identify Unprocessed Entries

Read the changelog and identify entries you did not process yet. Track the
process state in `wiki/downstream-instructions.md`. Record what you reviewed,
what you incorporated, and what you deferred.

For each unprocessed entry, record:

- **Scope** — which surface(s) and file(s) it touched (`CLAUDE.md`,
  `agent:<name>`, `skill:<name>`). A single entry may span several
- **Type** — added / modified / removed / renamed
- **What** changed and **Why**
- The **date** of the change

### Step 3: Evaluate Each Change

For each unprocessed entry, decide whether to bring it upstream. Read both the
changelog description and the actual files in the installation. Then compare
them with the canonical template:

```bash
# The changed file(s) in the installation
cat ~/.local/share/fit/outpost/Team/CLAUDE.md
cat ~/.local/share/fit/outpost/Team/.claude/agents/<agent>.md
cat ~/.local/share/fit/outpost/Team/.claude/skills/<skill>/SKILL.md

# The canonical template counterpart
cat products/outpost/templates/CLAUDE.md
cat products/outpost/templates/.claude/agents/<agent>.md
cat products/outpost/templates/.claude/skills/<skill>/SKILL.md
```

#### Evaluation Criteria

| Criterion                    | Include upstream?                                       |
| ---------------------------- | ------------------------------------------------------- |
| Fixes a real bug             | Yes — apply the fix                                     |
| Improves a workflow          | Yes — if the improvement is general rather than personal |
| Adds safety checks           | Yes — defensive improvements benefit all installations  |
| New skill / agent (general)  | Yes — add to template if useful for most installations  |
| New skill / agent (personal) | No — too specific to one user's workflow                |
| Removes a step or surface    | Maybe — find out why, because it may indicate a design issue |
| Changes paths / configs      | No — likely installation-specific                       |
| Style-only changes           | No — not worth the churn                                |

Ask: _"Would this change benefit a new Outpost installation, or is it specific
to this user's setup?"_

### Step 4: Apply Upstream Changes

Apply each change you decided to bring upstream to the matching template
surface. A single changelog entry may touch several surfaces. Apply each part
to its counterpart.

**For modified files (CLAUDE.md, agent, or skill):**

Read the downstream version and the template version. Apply the **specific
improvement** the changelog describes. Do not blindly overwrite the template
with the downstream file. It may mix installation-specific customizations with
general improvements.

**For new skills or agents:**

Copy the new file or directory into the template. Then review it for
installation-specific content (hardcoded paths, user names, personal
preferences). Generalize it before you add it:

```bash
ls ~/.local/share/fit/outpost/Team/.claude/skills/<new-skill>/
cat ~/.local/share/fit/outpost/Team/.claude/skills/<new-skill>/SKILL.md
```

**For removed surfaces:**

Delete the corresponding file or directory from the template. Rewire any
template reference that pointed to it (CLAUDE.md layout, agent skill lists).

**For capability data changes:**

If the entry describes changes to agent skill definitions (stages, checklists,
tool references, instructions), also update the capability YAML files:

- `data/pathway/capabilities/{id}.yaml`

After you update capability data, validate:

```bash
bunx fit-map validate
```

### Step 5: Verify Changes

After you apply upstream changes:

1. **Diff the template** (`git diff products/outpost/templates/`) to confirm
   you made only the intended changes.
2. **Re-run `bunx fit-map validate`** if you changed capability data.
3. **Check for consistency** across surfaces. If a skill, agent, or CLAUDE.md
   changed, make sure related surfaces stayed consistent. A skill may change
   its output format, so check its consumers still work. A directory dropped
   from CLAUDE.md means no agent and no skill may still name it.

### Step 6: Report

Summarize what you did:

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

Update `wiki/downstream-instructions.md` with what you processed, incorporated,
and deferred. Keep it concise. Record just enough to avoid a repeat pass.

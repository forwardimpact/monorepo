---
name: downstream-skill
description: Study downstream Basecamp installations, read their skill changelogs, and bring improvements upstream into the monorepo. Use when incorporating field-tested skill changes from installations back into the canonical skill definitions.
---

# Downstream

Study downstream Basecamp installations, read their skill changelogs, and bring
improvements upstream into the monorepo template and canonical skill data.

## Trigger

Run this skill when:

- The user asks to check downstream installations for skill changes
- The user wants to incorporate field-tested improvements from installations
- Periodically reviewing what downstream users have changed in their skills

## Prerequisites

- Access to downstream installation directories
- The downstream installation has run the **upstream** skill to produce a
  changelog

## Downstream Installations

| Installation | Path                      |
| ------------ | ------------------------- |
| Personal     | `~/Documents/Personal/`   |

## Inputs

- `<installation>/.claude/skills/CHANGELOG.md` — changelog produced by the
  upstream skill in each installation
- `<installation>/.claude/skills/*/SKILL.md` — current skill files in the
  installation
- `products/basecamp/template/.claude/skills/` — canonical template skills in
  this monorepo

## Outputs

- Updated skills in `products/basecamp/template/.claude/skills/`
- Updated capability data in `data/capabilities/` and
  `products/map/examples/capabilities/` (when changes affect agent skill
  definitions)
- Summary of what was incorporated and what was deferred

---

## Process

### Step 1: Read Downstream Changelogs

For each downstream installation, check for a skill changelog:

```bash
cat ~/Documents/Personal/.claude/skills/CHANGELOG.md 2>/dev/null
```

If no changelog exists, the installation hasn't run the **upstream** skill yet.
Report this and stop — do not try to infer changes without a structured
changelog.

### Step 2: Identify Unprocessed Entries

Read the changelog and identify entries that haven't been processed yet. Track
processing state in this skill's Memory section (below). Compare changelog
dates against the last processed date in Memory.

For each unprocessed entry, record:

- Skill name
- Change type (added / modified / removed)
- What changed and why
- The date of the change

### Step 3: Evaluate Each Change

For each unprocessed changelog entry, evaluate whether it should be brought
upstream. Read both the changelog description and the actual skill file in the
installation:

```bash
# Read the modified skill in the installation
cat ~/Documents/Personal/.claude/skills/<skill-name>/SKILL.md
```

Then compare with the canonical template:

```bash
# Read the canonical template skill
cat products/basecamp/template/.claude/skills/<skill-name>/SKILL.md
```

#### Evaluation Criteria

| Criterion              | Include upstream?                                    |
| ---------------------- | ---------------------------------------------------- |
| Fixes a real bug       | Yes — apply the fix                                  |
| Improves workflow      | Yes — if the improvement is general, not personal     |
| Adds safety checks     | Yes — defensive improvements benefit all users        |
| New skill (general)    | Yes — add to template if useful for most installations |
| New skill (personal)   | No — too specific to one user's workflow              |
| Removes a step         | Maybe — understand why, it may indicate a design issue |
| Changes paths/configs  | No — likely installation-specific                     |
| Style-only changes     | No — not worth the churn                             |

Ask: _"Would this change benefit a new Basecamp installation, or is it specific
to this user's setup?"_

### Step 4: Apply Upstream Changes

For changes that should be brought upstream, apply them to the canonical
template skills:

**For modified skills:**

Read the downstream version and the upstream version. Apply the specific
improvement described in the changelog — do not blindly overwrite the upstream
file with the downstream version, as the downstream file may contain
installation-specific customizations mixed with general improvements.

```bash
# Edit the template skill
# products/basecamp/template/.claude/skills/<skill-name>/SKILL.md
```

**For new skills:**

Copy the skill directory into the template:

```bash
ls ~/Documents/Personal/.claude/skills/<new-skill>/
cat ~/Documents/Personal/.claude/skills/<new-skill>/SKILL.md
```

Review the skill for installation-specific content (hardcoded paths, user names,
personal preferences) and generalize before adding to the template.

**For capability data changes:**

If the changelog describes changes to agent skill definitions (stages,
checklists, tool references, instructions), also update the capability YAML
files. These live in two locations that must stay in sync:

- `data/capabilities/{id}.yaml`
- `products/map/examples/capabilities/{id}.yaml`

After updating capability data, validate:

```bash
npx fit-map validate
```

### Step 5: Verify Changes

After applying upstream changes:

1. **Diff the template** to confirm only intended changes were made:

```bash
git diff products/basecamp/template/.claude/skills/
```

2. **Run validation** if capability data was changed:

```bash
npx fit-map validate
```

3. **Check for consistency** — if a skill was updated in the template, ensure
   related skills weren't left inconsistent (e.g., if `extract-entities` changed
   its output format, do skills that consume its output still work?).

### Step 6: Report

Summarize what was done:

```markdown
## Downstream Sync: <date>

### Incorporated
- **<skill>**: <one-line summary of what was brought upstream>

### Deferred
- **<skill>**: <one-line summary> — Reason: <why it was not included>

### No Changelog
- **<installation>**: No changelog found — upstream skill not yet run
```

### Step 7: Update Memory

After processing, update the Memory section below with the date and what was
processed. This prevents re-processing the same changelog entries.

## Memory

> **Keep this section up to date.** After every downstream sync, record what was
> processed here. This prevents re-processing the same entries and provides an
> audit trail.

### Sync Log

_No syncs performed yet._

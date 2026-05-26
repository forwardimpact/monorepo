# Part 05 — Documentation: update CLAUDE.md domain concepts

## Scope

Update the Domain Concepts section of CLAUDE.md to remove all stage references.

## Changes

### 1. Update CLAUDE.md

**File:** `CLAUDE.md`

In the **Domain Concepts** section, remove:

- `- **Stages** — `stages.yaml`` from the entity list
- `- **Drivers** — `drivers.yaml`` stays (unrelated)

Remove the stage-related lines from the entity file listing:

```
Before:
- **Stages** — `stages.yaml`
- **Drivers** — `drivers.yaml`

After:
- **Drivers** — `drivers.yaml`
```

In the entity format descriptions, remove any mention of `agent.stages` nesting.
The current text says:

> All entities use co-located `human:` and `agent:` sections.

This remains true. Update or add a note that skill agent sections use flat
`agent.focus`, `agent.readChecklist`, and `agent.confirmChecklist` fields.

Remove "Stages define lifecycle phases with constraints and checklists" from the
bullet list of entity descriptions.

### 2. Verify no stale stage references

```sh
grep -n -i 'stage' CLAUDE.md
```

Ensure the only remaining "stage" references are incidental (e.g., if the word
appears in unrelated context). Remove any that describe the stage concept as a
framework entity.

## Verification

Read CLAUDE.md and confirm:

- No `stages.yaml` reference
- No `agent.stages` reference
- No stage lifecycle description
- Domain concepts accurately describe the current flat structure

## Blast radius

| Action | Files       |
| ------ | ----------- |
| Modify | `CLAUDE.md` |

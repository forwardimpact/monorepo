# Plan 0980-a — kata-spec: forbid `file:line` citations in spec bodies

## Approach

Apply the two in-bullet extensions specified by [design-a.md](design-a.md) to
`.claude/skills/kata-spec/SKILL.md` in a single commit: one to the
"Writing a Spec" L4 "No HOW" bullet, one to the DO-CONFIRM L6 "No
implementation details" bullet.

Libraries used: none.

## Step 1 — Extend the L4 "No HOW" bullet

Add `` `file:line` `` as the named anti-pattern in the author-facing bullet.

Files modified: `.claude/skills/kata-spec/SKILL.md`.

In the "Writing a Spec" subsection, replace the bullet whose lead clause is
`**No HOW.**`:

Before:

```markdown
- **No HOW.** Name what each component does, not which mechanism implements it.
  Tool selection and sequencing belong in the design and plan.
```

After:

```markdown
- **No HOW.** Name what each component does, not which mechanism implements it.
  Tool selection and sequencing belong in the design and plan. Cite evidence
  by entity or behaviour name, not by `file:line` pointer.
```

Verification:

```sh
grep -nE '^- \*\*No HOW\.\*\*' -A3 .claude/skills/kata-spec/SKILL.md \
  | grep -F 'file:line'
```

Returns ≥1 match.

## Step 2 — Extend the L6 DO-CONFIRM bullet

Add `` `file:line` `` as the named anti-pattern in the verifier-facing bullet.

Files modified: `.claude/skills/kata-spec/SKILL.md`.

In the DO-CONFIRM checklist, replace the bullet whose lead clause is
`No implementation details have leaked in (HOW belongs in the plan)`:

Before:

```markdown
- [ ] No implementation details have leaked in (HOW belongs in the plan).
```

After:

```markdown
- [ ] No implementation details have leaked in (HOW belongs in the plan) —
      including `file:line` citations in Problem evidence.
```

Verification:

```sh
grep -nE 'HOW belongs in the plan' -A1 .claude/skills/kata-spec/SKILL.md \
  | grep -F 'file:line'
```

Returns ≥1 match.

## Step 3 — Run all four success-criteria tests

Verify the diff matches the spec's four success criteria.

Files modified: none beyond Steps 1–2.

| SC | Command | Expected |
| --- | --- | --- |
| 1 | `grep -nE '^- \*\*No HOW\.\*\*' -A3 .claude/skills/kata-spec/SKILL.md \| grep -F 'file:line'` | ≥1 match — Writing-a-Spec "No HOW" bullet contains `file:line` |
| 2 | `grep -nE 'HOW belongs in the plan' -A1 .claude/skills/kata-spec/SKILL.md \| grep -F 'file:line'` | ≥1 match — DO-CONFIRM "No implementation" bullet contains `file:line` |
| 3a | _scripted negative-vocabulary check, code block below_ | exits with `OK` (no other HOW-leak vectors named in added lines) |
| 3b | `git diff origin/main...HEAD -- .claude/skills/kata-spec/SKILL.md` | hunks touch only the "No HOW" bullet and the "No implementation details" bullet — no edits elsewhere in SKILL.md (visual diff inspection) |
| 4 | `git diff --name-only origin/main...HEAD` | `.claude/skills/kata-spec/SKILL.md` (plus any session-side wiki entries the implementer adds on its own branch) — no workflow files, no skill-pack publish config, no release tooling |

SC3a scripted check:

```sh
git diff origin/main...HEAD -- .claude/skills/kata-spec/SKILL.md \
  | grep -E '^\+[^+]' \
  | grep -iE 'function signature|full[- ]path import|code[- ]?fence' \
  && echo FAIL || echo OK
```

The added-lines stream (after filtering out diff header `+++`) is searched
for the deferred HOW-leak vectors named verbatim by spec § Out-of-scope row
4 ("function signatures, full-path imports, code-fenced implementation
snippets"). A match prints `FAIL`; no match prints `OK`.

If any test fails, edit the affected bullet only — do not touch other parts
of SKILL.md.

## Risks

none — the implementation surface is two bullet edits and the verifications
above cover both success-criteria sides.

## Execution

One agent, sequential steps (Step 1 → Step 2 → Step 3). Route to
`staff-engineer` — SKILL.md is procedural skill content (L4), not
user-facing documentation, so `technical-writer` is not the right home.

— Staff Engineer 🛠️

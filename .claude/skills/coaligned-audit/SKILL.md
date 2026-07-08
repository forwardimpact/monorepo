---
name: coaligned-audit
description: >
  Run the full Co-Aligned check suite and act on what it finds. Use for a
  periodic co-alignment health check, when CI reports a `coaligned` failure, or
  before a release — to triage every finding and route it to the fix that owns
  it.
---

# coaligned-audit

The maintenance loop for the Co-Aligned architecture. `coaligned` runs three
checks; this skill turns their findings into fixes by routing each to the skill
that owns the layer.

```sh
coaligned                # instructions + jtbd (and invariants if present)
coaligned --json         # machine-readable findings
```

Run the bare command first. It reports across subcommands at once, so a single
run shows the whole picture.

## Procedure

### Step 1 — Run the suite and read the findings

Run `coaligned`. Each finding names a subcommand, a location, and a
one-line reason. Group findings by subcommand before fixing anything — the fix
path differs by kind, and a length breach is a different problem from a stale
job block.

### Step 2 — Route each finding

| Finding from | What it means | Route to |
| --- | --- | --- |
| `instructions` | A layer exceeds its line or word cap | [coaligned-layer](../coaligned-layer/SKILL.md) |
| `jtbd` (schema) | An entry violates the JTBD structure | [coaligned-jtbd](../coaligned-jtbd/SKILL.md) |
| `jtbd` (stale block) | A generated block is out of date | `coaligned jtbd --fix` |
| `invariants` | A repo rule module flagged code | the module's hint |

Fix the cause, not the symptom:

- **Length breach** — do not just cut words. Move content to the layer that owns
  it (templates and tables to an L6 reference, procedure out of an L3 profile).
- **Stale job block** — never hand-edit a generated block. Edit the owning
  `package.json` and run `coaligned jtbd --fix`.
- **Invariant violation** — fix the code the rule objects to. Grandfather only
  during a real migration, and only by the module's documented `--seed` path —
  never widen an allow-list to silence a finding.

### Step 3 — Re-run until clean

Run `coaligned` again after each fix. Any finding fails the run; a clean
run is the bar. Re-running also catches the case where one fix exposed another —
trimming a layer can reveal a checklist that now needs its own block.

### Step 4 — Record what recurred

If the same class of finding keeps returning, the layer that owns it is
incomplete, not the contributor. Note the recurring class so the procedure,
reference, or invariant that should prevent it can be strengthened — a check
that fires every week is training people to ignore it.

## Done When

<do_confirm_checklist goal="Verify co-alignment holds before signing off">

- [ ] Every finding was routed to its owning fix, not silenced in place.
- [ ] Stale job blocks were regenerated, not hand-edited.
- [ ] Any grandfathering went through a module's `--seed` path during a real
      migration.
- [ ] `coaligned` passes with no findings.

</do_confirm_checklist>

## Documentation

- [Co-Aligned Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md)
  — the layered model the checks enforce.
- [libcoaligned README](https://github.com/forwardimpact/monorepo/blob/main/libraries/libcoaligned/README.md)
  — what each subcommand checks and how findings render.

---
name: coaligned-setup
description: >
  Bootstrap the Co-Aligned instruction architecture in a repository. Use
  when a repo has no layered agent instructions yet, when adopting the
  Co-Aligned standard, or when wiring `npx coaligned` into the checks so
  instruction layers, jobs, and invariants stay enforced.
---

# coaligned-setup

Stand up the
[Co-Aligned](https://www.coaligned.team/)
instruction architecture in a repository: the root identity and jobs files, the
invariant directory, and the `npx coaligned` checks that keep them honest.

Run this once per repository. For ongoing work use the sibling skills:
[coaligned-layer](../coaligned-layer/SKILL.md) for instruction layers,
[coaligned-jtbd](../coaligned-jtbd/SKILL.md) for jobs,
[coaligned-invariant](../coaligned-invariant/SKILL.md) for custom rules, and
[coaligned-audit](../coaligned-audit/SKILL.md) for the maintenance loop.

## Procedure

<read_do_checklist goal="Internalize the architecture before scaffolding">

- [ ] Confirm the eight layers and their one-job-each separation are clear.
- [ ] Confirm no instruction layers exist yet; if some do, repair them with
      coaligned-layer instead of overwriting.
- [ ] Decide the jobs structure (see Step 1) before creating JTBD.md.

</read_do_checklist>

### Step 1 — Decide the jobs structure

The jobs layer (L2) has two shapes. Pick by how the repo is packaged, not by
preference.

- **Single static `JTBD.md`** — the repo is one unit (one deployable, one
  library, a monolith). Author Big Hire entries directly in `JTBD.md`. No
  generation.
- **Generated `.jobs` blocks** — the repo is genuinely many packages, each
  with its own `package.json`. Each package declares `jobs` in its manifest;
  `npx coaligned jtbd --fix` generates the catalog and job blocks into the
  README and root `JTBD.md`.

When in doubt, choose the static file — fewer moving parts. See
[references/structure-decision.md](references/structure-decision.md).

### Step 2 — Create the root layers (L1, L2)

Create the auto-loaded identity and on-demand standards files. Keep each within
its cap (L1 ≤ 192 lines; L2 ≤ 320 lines).

- **`CLAUDE.md`** (L1) — project identity: what the repo is, who it serves,
  where things live, and how to route to skills. Orientation, not procedure.
- **`CONTRIBUTING.md`** (L2) — contribution standards: invariants, the quality
  commands, security policy, and the universal checklists.
- **`JTBD.md`** (L2) — the jobs, per Step 1. Use coaligned-jtbd to author
  entries to spec.

Do not restate one file in another. CLAUDE.md orients; CONTRIBUTING.md governs.

### Step 3 — Create the invariant directory

Create `.coaligned/invariants/`. Leave it empty for now, or add a first rule
module with coaligned-invariant. The directory is where the repo's own
declarative checks live; `npx coaligned invariants` discovers every
`*.rules.mjs` under it.

### Step 4 — Wire the checks into the repository

Add `npx coaligned` to the repository's check command so every layer, job, and
invariant is enforced before merge.

```sh
npx coaligned                # instructions + jtbd (and invariants if present)
npx coaligned instructions   # layer length and checklist caps only
npx coaligned jtbd --fix     # regenerate stale catalog and job blocks
npx coaligned invariants     # the repo's own rule modules
```

Run the bare `npx coaligned` in the repository's lint/check task and in CI.

### Step 5 — Verify the bootstrap

Run `npx coaligned`. A clean run means the layers fit their caps and the jobs
validate. Fix any finding before committing — route by subcommand the same way
[coaligned-audit](../coaligned-audit/SKILL.md) does.

## Done When

<do_confirm_checklist goal="Verify the architecture stands before committing">

- [ ] `CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` exist and stay within
      their caps.
- [ ] `.coaligned/invariants/` exists.
- [ ] `npx coaligned` is wired into the repository's check command and CI.
- [ ] `npx coaligned` passes with no findings.

</do_confirm_checklist>

## Documentation

- [Co-Aligned Instruction Architecture Standard](https://www.coaligned.team/)
  — the eight layers, their caps, and the rules that separate them.
- [libcoaligned README](https://github.com/forwardimpact/monorepo/blob/main/libraries/libcoaligned/README.md)
  — what each `coaligned` subcommand checks.

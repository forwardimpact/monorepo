---
name: coaligned-jtbd
description: >
  Author and maintain Jobs To Be Done entries for the Co-Aligned standard.
  Use when writing a Big Hire or Little Hire, when adding a `<job>` tag, when
  `package.json .jobs` blocks are stale, or when `coaligned jtbd` reports a
  schema or freshness failure.
---

# coaligned-jtbd

Jobs To Be Done is what agents align to: the progress each persona seeks in a
specific circumstance, not a feature list. This skill authors job entries to
spec and keeps the generated blocks fresh.

`coaligned jtbd` validates entries against the schema and checks that
generated blocks are current. `coaligned jtbd --fix` regenerates them.

## Two kinds of job

- **Big Hire** — the adoption decision, one per persona-outcome pair. Lives in
  the root `JTBD.md` with the full entry structure.
- **Little Hire** — a narrower, repeated daily job. Lives wherever it fits:
  package READMEs, design docs, near the code that serves it.

## Procedure

### Step 1 — Reconstruct the job from a real moment

Start from a struggle story, not a template. Answer: who is the persona, what
just happened that created the job, what progress do they want, and what do they
hire today instead? A job invented at a desk tends to confirm assumptions; a job
reconstructed from a real decision tends to surprise.

### Step 2 — Write the entry to structure

The first five elements are required for every entry. **Forces** and **Fired
When** are required for products and omitted for services and libraries.

See [references/entry-template.md](references/entry-template.md) for the full
structure and [references/example.md](references/example.md) for a worked
entry. Hold each entry to the seven quality properties — the load-bearing ones:

- **Progress, not features.** If removing the product name makes the statement
  meaningless, the job is solution-shaped. Rewrite it.
- **Trigger is a moment, not a role.** It answers "what just happened?", not
  "who is this person?".
- **Competing hires include nonconsumption.** "Hire nothing" is usually the
  real incumbent; name it.
- **Forces are asymmetric.** If all four feel equal, it was filled from a
  template, not reconstructed.

### Step 3 — Tag the job

Wrap every job — Big or Little — in a `<job>` tag so it is discoverable without
knowing where it lives:

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

Keep the full opening tag on one line within 74 characters. Discover jobs with
`rg '<job '`.

### Step 4 — Regenerate or validate

- **Static `JTBD.md`** — run `coaligned jtbd` to validate entry structure.
- **Generated `.jobs` blocks** — edit the `jobs` array in the owning
  `package.json`, then run `coaligned jtbd --fix` to regenerate the catalog
  and job blocks. Commit the regenerated files.

```sh
coaligned jtbd          # validate entries and check freshness
coaligned jtbd --fix    # regenerate stale catalog and job blocks
```

A stale generated block fails the check; never hand-edit generated blocks —
edit the manifest and regenerate.

## Done When

<do_confirm_checklist goal="Verify the jobs are sound before committing">

- [ ] Each entry states progress, not a feature wearing job syntax.
- [ ] Every trigger is a moment, and every Competes With names nonconsumption.
- [ ] Every job is wrapped in a `<job>` tag on a single ≤74-char opening line.
- [ ] Generated blocks were regenerated from manifests, not hand-edited.
- [ ] `coaligned jtbd` passes with no schema or freshness findings.

</do_confirm_checklist>

## Documentation

- [Co-Aligned Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md)
  — where jobs sit in the layered architecture.
- [libcoaligned README](https://github.com/forwardimpact/monorepo/blob/main/libraries/libcoaligned/README.md)
  — what `coaligned jtbd` validates and regenerates.

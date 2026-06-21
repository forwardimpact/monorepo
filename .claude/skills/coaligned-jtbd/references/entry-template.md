# JTBD entry structure

A Big Hire entry follows a fixed structure. The first five elements are
required for every entry. **Forces** and **Fired When** are required for
products and omitted for services and libraries.

- **User** — the persona hiring the product (`##` heading).
- **Goal** — the high-level progress sought (`###` heading).
- **Trigger** — the specific moment that creates the job, not a role
  description.
- **Big Hire** — "{progress}." — the adoption decision: why this gets hired
  over the alternatives.
- **Little Hire** — "{progress}." — the repeated daily use that brings the user
  back.
- **Competes With** — what gets hired instead; semicolon-delimited; must
  include a "hire nothing" (nonconsumption) option.
- **Forces** *(products only)* — four forces: **Push** (status-quo pain),
  **Pull** (desired future state, not features), **Habit** (current behavior
  resisting change), **Anxiety** (fear blocking adoption).
- **Fired When** *(products only)* — conditions under which the product gets
  abandoned; include at least one environmental shift beyond product failure.

## Manifest form (generated `.jobs` blocks)

When jobs are generated from `package.json`, the same fields appear as a `jobs`
array. Services and libraries carry Little Hire entries — no `forces` or
`firedWhen`:

```json
{
  "jobs": [
    {
      "user": "<persona>",
      "goal": "<high-level progress sought>",
      "trigger": "<the moment that creates the job>",
      "bigHire": "<the adoption decision>.",
      "littleHire": "<the repeated daily use>.",
      "competesWith": "<alt>; <alt>; hire nothing and <status quo>"
    }
  ]
}
```

`npx coaligned jtbd --fix` reads these and regenerates the README catalog rows
and the marker-delimited job blocks. Edit the manifest, never the generated
block.

## The seven quality properties

1. **Progress, not features.** Remove the product name; if the statement goes
   meaningless, it was solution-shaped.
2. **Trigger is a moment, not a role.** It answers "what just happened?".
3. **Competing hires include nonconsumption.** Name the "hire nothing" option.
4. **Pull describes a desired future, not a feature list.**
5. **Forces are asymmetric.** One force usually dominates.
6. **Fired When includes the world, not just the product.** A reorg, a budget
   cut, a tool ban.
7. **Field-validated, not desk-authored.** Entries are hypotheses until a
   customer struggle story confirms them.

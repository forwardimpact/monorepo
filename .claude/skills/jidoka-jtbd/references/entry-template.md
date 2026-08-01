# JTBD entry structure

A Big Hire entry follows a fixed structure. The first five elements are
required for every entry. **Forces** and **Fired When** are required for
products. Omit them for services and libraries.

- **User** — the persona that hires the product (`##` heading).
- **Goal** — the high-level progress the persona seeks (`###` heading).
- **Trigger** — the specific moment that creates the job. It is not a role
  description.
- **Big Hire** — "{progress}." This is the adoption decision, or why the user
  hires this over the alternatives.
- **Little Hire** — "{progress}." This is the repeated daily use that brings
  the user back.
- **Competes With** — what the user hires instead. Delimit the entries with
  semicolons. It must include a "hire nothing" (nonconsumption) option.
- **Forces** *(products only)* — four forces. **Push** is status-quo pain.
  **Pull** is the desired future state. It is not a feature list. **Habit** is
  the current behavior that resists change. **Anxiety** is the fear that blocks
  adoption.
- **Fired When** *(products only)* — the conditions under which the user
  abandons the product. Include at least one environmental shift beyond product
  failure.

## Manifest form (generated `.jobs` blocks)

When `jidoka jtbd --fix` generates jobs from `package.json`, the same fields
appear as a `jobs` array. Services and libraries carry Little Hire entries with
no `forces` and no `firedWhen`:

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

`jidoka jtbd --fix` reads these and regenerates the README catalog rows
and the marker-delimited job blocks. Edit the manifest. Never edit the
generated block.

## The seven quality properties

1. **State the progress. Do not list features.** Remove the product name. If
   the statement goes meaningless, it was solution-shaped.
2. **The trigger is a moment. It is not a role.** It answers "what just
   happened?".
3. **The Competes With list includes nonconsumption.** Name the "hire nothing"
   option.
4. **Pull describes a desired future. It is not a feature list.**
5. **Forces are asymmetric.** One force usually dominates.
6. **Fired When includes the world. It does not name only the product.** A
   reorg, a budget cut, a tool ban.
7. **Validate in the field. Do not author at a desk.** Entries are hypotheses
   until a customer struggle story confirms them.

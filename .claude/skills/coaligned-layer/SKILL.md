---
name: coaligned-layer
description: >
  Author or repair an instruction layer to the Co-Aligned standard — an agent
  profile, agent reference, SKILL.md, skill reference, or checklist. Use when
  adding an agent or skill, when `npx coaligned instructions` flags a length
  breach, or when one layer has started restating another.
---

# coaligned-layer

The Co-Aligned architecture splits instructions across eight layers, each with
one job. A defect in one layer is a different class of problem from a defect in
another, and that separation is what makes a failed run attributable. This
skill authors and repairs the layers a contributor edits: L3–L7.

`npx coaligned instructions` enforces a line cap and a word cap on every layer.
Either breach fails. See [references/layer-reference.md](references/layer-reference.md)
for the layers, their properties, and their caps.

## Procedure

### Step 1 — Identify the layer

Name which layer you are writing — each owns one job:

- **L3 agent profile** — persona, voice, skill routing, scope.
- **L4 agent reference** — a protocol shared across agents (memory,
  coordination, approval).
- **L5 SKILL.md** — the complete procedure for one domain.
- **L6 skill reference** — data the procedure consults: templates, examples,
  lookup tables.
- **L7 checklist** — binary verification at one pause point.

Each layer's defining property and cap live in
[references/layer-reference.md](references/layer-reference.md).

If you are unsure which layer owns the content, that is the signal two layers
are about to blur. Resolve it before writing.

### Step 2 — Write to the layer's job, and only its job

Apply the one rule that governs every layer: **no layer restates another.**

- A profile (L3) defines boundaries; the steps go in the skill (L5).
- A procedure (L5) makes decisions and sequences work; templates, examples, and
  tables go in a reference (L6).
- A reference (L6) is declarative; if it prescribes steps, it belongs in L5.
- A checklist (L7) verifies a known step; if an item teaches, the procedure
  above it is incomplete — move the teaching up.

When two layers must mention the same tool, separate them by voice: the lower
layer describes ("ToolX sends a message"), the higher layer directs ("Use ToolX
to deliver the report").

### Step 3 — Write checklists as gates, not prose

A checklist is binary verification at a natural pause point. Use the right type:

- **READ-DO** — entry gate. Read each item, then do it. Before work begins.
- **DO-CONFIRM** — exit gate. Do from memory, then confirm. Before a commit,
  merge, or release.

Tag every checklist so it is discoverable. See
[references/checklist-tagging.md](references/checklist-tagging.md) for the tags
and the seven properties of a good checklist.

### Step 4 — Fit the cap

Run `npx coaligned instructions`. On a length breach, do not just delete words —
move them to the layer that owns them:

- L5 over cap → push templates, examples, and tables down to an L6 reference.
- L3 over cap → push procedure to the skill it routes to.
- L4/L6 over cap → split into two references, each independently correct.

Trimming that loses meaning means the content is in the wrong layer, not that it
is too long.

### Step 5 — Verify

`npx coaligned instructions` passes. Re-read the edited layer against its
single job: a reader following only this layer should get exactly what the layer
promises and nothing another layer owns.

## Done When

<do_confirm_checklist goal="Verify the layer holds before committing">

- [ ] The layer carries only its own job — no content another layer owns.
- [ ] Shared tools are separated by voice, not duplicated.
- [ ] Every checklist is tagged and uses the correct READ-DO / DO-CONFIRM type.
- [ ] `npx coaligned instructions` passes with no length findings.

</do_confirm_checklist>

## Documentation

- [Co-Aligned Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md) —
  every layer, its properties, and the rules that separate them.
- [libcoaligned README](https://github.com/forwardimpact/monorepo/blob/main/libraries/libcoaligned/README.md) —
  what `coaligned instructions` enforces.

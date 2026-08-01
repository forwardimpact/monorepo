---
name: jidoka-layer
description: >
  Author or repair an instruction layer to the Jidoka standard. A layer is an
  agent profile, agent reference, SKILL.md, skill reference, or checklist. Use
  when you add an agent or skill, when `jidoka instructions` flags a length
  breach, or when one layer restates another.
---

# Author Instruction Layers

The Jidoka instruction architecture splits instructions across eight layers.
Each layer has one job. A defect in one layer is a different class of problem
from a defect in another. That separation makes a failed run attributable. This
skill authors and repairs the layers a contributor edits: L3–L7. The standard
sets the properties of the root identity and jobs files (L1/L2).
[jidoka-setup](../jidoka-setup/SKILL.md) bootstraps those files once. It also
writes the `CLAUDE.md` section that shows how to discover jobs and checklists.
Repair those files with jidoka-setup. Do not repair them here.

`jidoka instructions` enforces a line cap and a word cap on every layer.
Either breach fails. See
[references/layer-reference.md](references/layer-reference.md) for the layers,
their properties, and their caps.

## When to Use

- You add an agent profile, agent reference, skill, skill reference, or
  checklist
- `jidoka instructions` flags a length breach
- One layer restates another

## Checklists

<do_confirm_checklist goal="Verify the layer holds before committing">

- [ ] The layer carries only its own job and no content another layer owns.
- [ ] Layers that mention the same tool differ by voice and do not duplicate
      text.
- [ ] Every checklist carries a tag and uses the correct READ-DO / DO-CONFIRM
      type.
- [ ] `jidoka instructions` passes with no length findings.

</do_confirm_checklist>

## Process

### Step 1: Identify the layer

Name the layer you write. Each layer owns one job:

- **L3 agent profile** — persona, voice, skill routing, scope.
- **L4 agent reference** — a protocol shared across agents (memory,
  coordination, approval).
- **L5 SKILL.md** — the complete procedure for one domain.
- **L6 skill reference** — data the procedure consults: templates, examples,
  lookup tables.
- **L7 checklist** — binary verification at one pause point.

The property and cap that define each layer live in
[references/layer-reference.md](references/layer-reference.md).

If you are unsure which layer owns the content, that is the signal two layers
are about to blur. Resolve it before you write.

### Step 2: Write to the layer's job, and only its job

Apply the one rule that governs every layer: **no layer restates another.**

- A profile (L3) defines boundaries. The steps go in the skill (L5).
- A procedure (L5) decides and sequences the work. Templates, examples, and
  tables go in a reference (L6).
- A reference (L6) is declarative. If it prescribes steps, it belongs in L5.
- A checklist (L7) verifies a known step. If an item teaches, the procedure
  above it is incomplete. Move the content up.

When two layers must mention the same tool, separate them by voice. The lower
layer describes ("ToolX sends a message"). The higher layer directs ("Use ToolX
to deliver the report").

### Step 3: Write checklists as gates instead of prose

A checklist is binary verification at a natural pause point. Use the right type:

- **READ-DO** — entry gate. Read each item, then do it. Before work begins.
- **DO-CONFIRM** — exit gate. Do from memory, then confirm. Before a commit,
  merge, or release.

Tag every checklist so it is discoverable. See
[references/checklist-tagging.md](references/checklist-tagging.md) for the tags
and the seven properties of a good checklist.

### Step 4: Fit the cap

Run `jidoka instructions`. On a length breach, do not simply delete words.
Move them to the layer that owns them:

- L5 over cap → push templates, examples, and tables down to an L6 reference.
- L3 over cap → push procedure to the skill it routes to.
- L4/L6 over cap → split into two references, each independently correct.

If a trim loses meaning, the content is in the wrong layer. The content is not
too long.

### Step 5: Verify

`jidoka instructions` passes. Re-read the edited layer against its single job.
A reader who follows only this layer gets exactly what the layer promises. The
reader gets nothing another layer owns.

## Documentation

- [Jidoka Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md)
  — every layer, its properties, and the rules that separate them.
- [Jidoka website](https://www.jidoka.team/)
  — the standard's story: built-in quality, stop the line.

---
title: Author or Repair One Instruction Layer
description: Write or fix one layer at a time. Name the layer that owns a piece of text, move misplaced text, and bring an over-budget layer back under its cap without a loss of meaning.
---

The architecture is in place. Now a concrete edit arrives. You add an agent.
You add a skill. A check fails on a length cap. Every one of those is the same
bounded task: one layer, one job, one budget.

This guide covers three moves. Name the layer that owns a piece of text. Move
text that sits in the wrong layer. Bring an over-budget layer back under its
cap. Two neighbours sit outside the task. The harness owns L0, and
you never edit it. Repair the root identity, standards, and jobs files through
[Adopt Jidoka in Your Repository](/docs/getting-started/). Checklists have
their own bounded task in
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).

## Prerequisites

- Node.js 22 or later, so `npx @forwardimpact/jidoka instructions` runs in your
  repository.
- The skill pack installed: `apm install forwardimpact/jidoka-skills`.
- The layered architecture already in place. See
  [Put Your Instructions on One Layered Architecture](/docs/layered-instructions/).

## The four layers you edit

Four files hold the instructions a contributor changes week to week. Each one
carries a single job and a budget the check enforces.

| Layer | The file you write | The one job it holds | Cap |
| --- | --- | --- | --- |
| L3 agent profile | `.claude/agents/staff-engineer.md` | Persona, voice, skill routing, scope limits | 72 lines, 448 words |
| L4 agent reference | `.claude/agents/x-approval-protocol.md` | A protocol several agents share | 192 lines, 1280 words |
| L5 skill procedure | `.claude/skills/release-notes/SKILL.md` | The complete procedure for one domain | 192 lines, 1280 words |
| L6 skill reference | `.claude/skills/release-notes/references/version-table.md` | Templates, worked examples, lookup data | 128 lines, 768 words |

A line cap and a word cap gate every layer. Either breach fails the check.
Front matter is exempt from both counts, so a long `description` field costs
you nothing.

Loading explains why the caps differ. A profile loads on every run, a procedure
on every invocation of its skill, and a reference only when the procedure calls
for it. The tightest cap sits on the layer that loads most often. Jidoka sets no
top-level shape for your repository. A structure standard extends this one. See
the [Monorepo structure standard](https://www.monorepo.team/).

## Name the layer that owns the text

Start with the text. The file comes second. What the text does decides where it
goes.

| The text you hold | The layer that owns it |
| --- | --- |
| Names a persona, a voice, or a scope limit | L3 agent profile |
| Gives a protocol that several agents follow | L4 agent reference |
| Decides, sequences, or justifies a step | L5 skill procedure |
| Supplies a template, a worked example, or a lookup table | L6 skill reference |
| Confirms that a known step happened | L7 checklist |

When you cannot name the owning layer, two layers are about to blur. Resolve
the ownership before you write a line. A blur costs you attribution, and a
failed run then points at two layers instead of one.

Two layers often need to name the same tool. Separate them by voice. The lower
layer describes the tool. The higher layer directs its use. A reference states
that the release tool writes a tag. The procedure states "Use the release tool
to tag the version". Neither sentence repeats the other.

## Write to the layer's job, and only its job

One rule governs every layer. No layer restates another.

- **A profile bounds.** It names one persona and the limits of its scope. The
  steps live in the skill it routes to.
- **An agent reference shares.** It holds a cross-cutting protocol such as
  memory, coordination, or approval. When only one skill consults it, move the
  content into that skill's `references/` directory.
- **A procedure decides.** It carries sequence, rationale, and judgment calls.
  A contributor who follows only the procedure produces correct output with no
  tribal knowledge. Write in the imperative. Write "Use the release tool to tag
  the version". Do not write "the release tool can tag the version".
- **A reference supplies.** It holds templates, worked examples, and lookup
  tables. A step inside a reference means the procedure above it is incomplete.

## Move text that sits in the wrong layer

**Push data down.** Cut the table, template, or worked example out of the
procedure. Paste it into a new file under the skill's `references/` directory.
Leave one line in the procedure that names the reference and the moment to read
it, such as "See `references/version-table.md` for the version mapping, and
consult it when you pick the next tag."

**Delete the duplicate.** When two layers say the same thing, keep the sentence
in the layer that owns the description. Delete it from the layer above. Replace
it with a direction that names the tool and the outcome.

A move is finished when both layers read correctly on their own. Read the layer
you cut from, then the layer you pasted into. Each one still delivers what it
promises.

## Bring a layer back under its cap

Run the check:

```sh
npx @forwardimpact/jidoka instructions
```

A breach names the file, the count, the cap, and the layer:

```text
.claude/skills/release-notes/SKILL.md
    error  214 lines (max 192, skill procedure)  instructions.line-budget
✖ 1 problem (1 error, 0 warnings)
```

A word breach reports the same way under `instructions.word-budget`, and each
finding prints a one-line hint below it. The check walks every `.claude/`
directory and skips dependency and build output.

Do not start by deleting words. Move them to the layer that owns them:

| The breach | The move |
| --- | --- |
| L5 over cap | Push templates, examples, and tables down into an L6 reference. |
| L3 over cap | Push procedure into the skill the profile routes to. |
| L4 or L6 over cap | Split into two references. Each one is correct on its own. |

One diagnostic settles the rest. Trim the prose. If the trim loses meaning, the
content sits in the wrong layer. The content is not too long.

## Two failures to avoid

**A profile with no front matter.** A `.claude/agents/*.md` file counts as a
profile only when it carries both a `name` field and a `description` field.
Without them it counts as an agent reference and takes the larger L4 budget. The
agent loader applies the same test, so the agent never loads. The check passes
and the agent is missing. Open every profile with both fields:

```markdown
---
name: staff-engineer
description: Reviews architecture changes and approves implementation plans.
---
```

Prefix every agent reference with `x-`. The prefix keeps references visible in
a directory listing and sorts them after the profiles.

**A skill reference outside `references/`.** The check budgets
`<skill>/references/*.md` only. A markdown file beside `SKILL.md` carries no
budget. It grows without a limit, and nothing stops it from drifting. Put every
skill reference in the `references/` directory.

## Verify

You have reached the outcome of this guide when:

- `npx @forwardimpact/jidoka instructions` reports no findings.
- Each layer you edited delivers what its own job promises. It delivers nothing
  another layer owns.
- Layers that name the same tool differ by voice. Neither repeats the other's
  text.
- Every checklist you touched carries a tag and the correct gate type.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../write-checklists -->

<!-- part:card:../write-jobs -->

<!-- part:card:../../stop-the-line -->

</div>

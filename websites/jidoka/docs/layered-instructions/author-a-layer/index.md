---
title: Author or Repair One Instruction Layer
description: Write or fix one layer at a time. Find the layer that owns a piece of text, move misplaced text, and bring an over-budget layer back under its cap without a loss of meaning.
---

The architecture is in place, and now you have a concrete edit to make. You add
an agent or a skill, or a check fails on a length cap. Each of these is the same
bounded task: you edit one layer, for one job, inside one budget.

This guide covers three tasks: find the layer that owns a piece of text, move
text that is in the wrong layer, and bring an over-budget layer back under its
cap. The other layers are outside this guide. The harness owns L0, and you
never edit it. To repair the root identity, standards, and jobs files, see
[Adopt Jidoka in Your Repository](/docs/getting-started/). Checklists have
their own guide,
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).

## Prerequisites

- Node.js 22 or later, so `npx jidoka instructions` runs in your
  repository.
- The skill pack installed: `apm install forwardimpact/jidoka-skills`.
- The layered architecture already in place. See
  [Put Your Instructions on One Layered Architecture](/docs/layered-instructions/).

## The four layers you edit

Four kinds of file hold the instructions that a contributor changes from week
to week. Each one has a single job and a budget that the check enforces.

| Layer | The file you write | The one job it holds | Cap |
| --- | --- | --- | --- |
| L3 agent profile | `.claude/agents/staff-engineer.md` | Persona, voice, skill routing, scope limits | 72 lines, 448 words |
| L4 agent reference | `.claude/agents/x-approval-protocol.md` | A protocol several agents share | 192 lines, 1280 words |
| L5 skill procedure | `.claude/skills/release-notes/SKILL.md` | The complete procedure for one domain | 192 lines, 1280 words |
| L6 skill reference | `.claude/skills/release-notes/references/version-table.md` | Templates, worked examples, lookup data | 128 lines, 768 words |

Every layer has a line cap and a word cap, and the check fails when a file
breaks either one. Front matter is not counted, so a long `description` field
does not use up the budget.

The caps differ because the layers load at different times. A profile loads on
every run, a procedure on every invocation of its skill, and a reference only
when the procedure needs it. The layer that loads most often has the smallest
cap. Jidoka does not define the top-level shape of your repository. A structure
standard adds that on top. See the
[Monorepo structure standard](https://www.monorepo.team/).

## Find the layer that owns the text

Start with the text, and choose the file second. What the text does decides
where it goes.

| What the text does | The layer that owns it |
| --- | --- |
| Describes a persona, a voice, or a scope limit | L3 agent profile |
| Gives a protocol that several agents follow | L4 agent reference |
| Decides, sequences, or justifies a step | L5 skill procedure |
| Gives a template, a worked example, or a lookup table | L6 skill reference |
| Confirms that a known step happened | L7 checklist |

If you cannot find one owning layer, two layers are about to overlap. Resolve
the ownership before you write a line. When two layers overlap, a failed run
points at two layers instead of one.

Two layers often need to mention the same tool. Give them different voices. The
lower layer describes the tool, and the higher layer directs its use. A
reference says that the release tool writes a tag. The procedure says "Use the
release tool to tag the version". Neither sentence repeats the other.

## Write to the layer's job, and only its job

One rule applies to every layer: no layer repeats another.

- **A profile sets limits.** It describes one persona and the limits of its
  scope. The steps are in the skill it routes to.
- **An agent reference gives a shared protocol.** Memory, coordination, and
  approval are the usual ones. When only one skill reads it, move the content
  into that skill's `references/` directory.
- **A procedure decides.** It contains the sequence, the reasons, and the
  judgment calls. A contributor who follows only the procedure produces correct
  output and needs no unwritten knowledge. Write it as instructions: "Use the
  release tool to tag the version" and not "the release tool can tag the
  version".
- **A reference gives data.** It contains templates, worked examples, and
  lookup tables. A step inside a reference means that the procedure above it
  is incomplete.

## Move text that is in the wrong layer

**Move data down.** Cut the table, the template, or the worked example out of
the procedure. Paste it into a new file under the skill's `references/`
directory. Leave one line in the procedure that points to the reference and
says when to read it, such as "See `references/version-table.md` for the
version mapping, and consult it when you pick the next tag."

**Delete the duplicate.** When two layers say the same thing, keep the sentence
in the layer that owns the description and delete it from the layer above.
Replace it with a direction that states the tool and the outcome.

A move is complete when both layers read correctly on their own. Read the layer
you cut from, then the layer you pasted into. Each one must still deliver what
it promises.

## Bring a layer back under its cap

Run the check:

```sh
npx jidoka instructions
```

A breach shows the file, the count, the cap, and the layer:

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
| L5 over cap | Move templates, examples, and tables down into an L6 reference. |
| L3 over cap | Move the procedure into the skill the profile routes to. |
| L4 or L6 over cap | Split it into two references that are each correct on their own. |

One test settles the rest: trim the prose. If the trim loses meaning, the
content is in the wrong layer, and the problem is not the length.

## Two failures to avoid

**A profile with no front matter.** A `.claude/agents/*.md` file counts as a
profile only when it has both a `name` field and a `description` field. Without
them it counts as an agent reference and gets the larger L4 budget. The agent
loader applies the same test, so the agent never loads. The check passes, and
the agent is missing. Start every profile with both fields:

```markdown
---
name: staff-engineer
description: Reviews architecture changes and approves implementation plans.
---
```

Prefix every agent reference with `x-`. The prefix keeps references visible in
a directory listing and sorts them after the profiles.

**A skill reference outside `references/`.** The check applies a budget to
`<skill>/references/*.md` only. A markdown file next to `SKILL.md` has no
budget, so it grows without a limit and nothing stops it from drifting. Put
every skill reference in the `references/` directory.

## Verify

This guide is complete when:

- `npx jidoka instructions` reports no findings.
- Each layer you edited delivers what its own job promises, and nothing that
  another layer owns.
- Layers that mention the same tool use different voices, and neither repeats
  the other's text.
- Every checklist you touched has a tag and the correct gate type.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../write-checklists -->

<!-- part:card:../write-jobs -->

<!-- part:card:../../stop-the-line -->

</div>

---
title: Put Your Instructions on One Layered Architecture
description: Give every instruction file one owning question, one load moment, and one budget. A bad agent run then points at exactly one file.
---

An agent did the wrong thing. You open the agent profile, the skill it ran, two
reference files, and the root `CLAUDE.md`. All five say something about the work
and none is clearly wrong. You cannot tell which file to fix, so you add a
sentence to whichever one you have open. The next run fails in a new way.

This guide gives your instructions a shape that ends that loop. Each file gets
one job, one load moment, and one size it must fit. A failed run then points to
a single layer, and you know which file to fix.

## Before you start

Adopt the architecture first. The
[getting-started guide](/docs/getting-started/) creates the root files, the
invariant directory, and the check. This guide assumes you already have a root
`CLAUDE.md`, a `CONTRIBUTING.md`, and a `JTBD.md`, and that you can run the
check:

```sh
apm install forwardimpact/jidoka-skills
npx jidoka instructions
```

## Why one job per layer

The layers go from the most general to the most specific. General layers apply
to every contributor on every run, and specific layers apply to one domain of
work or to one pause point inside it. A contributor follows the most
specific layer that applies to the task. That order lets you trace a defect to
one layer.

A wrong procedure, stale data, and a missing verification are three different
failures with three different fixes. You can tell them apart only while three
different files own them. If you merge a procedure and its lookup table into one
file, a failed run cannot show which half was wrong.

Two pairs of layers have the same shape. A profile sets the limits of an agent,
and an agent reference gives the protocols those agents share. A procedure gives
the steps, and a skill reference gives the data those steps read. The bottom
three layers share one folder but still have three different roles: L5 gives
steps, L6 gives data, and L7 confirms.

## The eight layers in one table

| Layer | Owning question | Loaded | Cap |
| --- | --- | --- | --- |
| L0 system prompt | How does a turn work in this runtime? | once per session | runtime-owned |
| L1 root `CLAUDE.md` | What is this project, and where do things live? | auto, every run | 192 lines |
| L1 subdirectory `CLAUDE.md` | What is local to this directory? | on demand | 128 lines |
| L2 `CONTRIBUTING.md` | What governs every contribution? | on demand | 320 lines |
| L2 `JTBD.md` | What progress does each user seek? | on demand | 320 lines |
| L3 agent profile | Who is this agent, and what may it touch? | auto, every run | 72 lines |
| L4 agent reference | What protocol do several agents share? | on demand | 192 lines |
| L5 `SKILL.md` | How does this domain of work get done? | auto, per skill | 192 lines |
| L6 skill reference | What data does the procedure consult? | on demand | 128 lines |
| L7 checklist block | Did the known step happen? | with its file | 9 items |

## Loading and budgets

**Auto-loaded layers cost context on every run.** The root `CLAUDE.md`, the
agent profile, and the invoked `SKILL.md` enter the context window whether the
current task needs them or not. Every line you add is a line the agent reads
even when it does unrelated work.

**On-demand layers load only when a file points to them.** A subdirectory
`CLAUDE.md`, an agent reference, and a skill reference load when someone follows
a pointer to them. Detail in these layers uses little context, so move it down
here and leave a pointer in the layer above.

Every file layer has a line cap and a word cap, and the check fails when a file
breaks either one. You do not need to memorize the word caps, because the check
prints both numbers when it fails. The L7 cap counts items instead of lines,
because the item count tracks the load on working memory and a wrapped line does
not. Treat a breach as a sign that content is in the wrong layer. If you cannot
trim the file without a loss of meaning, the words belong in another layer.

## The rules that keep layers apart

No check enforces these rules fully, so apply them yourself while you write.

1. **No layer repeats another.** A duplicated sentence has two owners, so no one
   is responsible for it. One copy goes stale, and no one can say which copy is
   current.
2. **When two layers mention the same tool, give them different voices.** The
   lower layer describes the tool, and the higher layer directs its use. "The
   search tool lists matches" is a description. "Use the search tool to find
   the stale reference" is a direction.
3. **The identity file orients, the standards file sets the rules, and the
   skills give the steps.** `CLAUDE.md` answers what, who, and where.
   `CONTRIBUTING.md` states the rules. The steps are in the skill that owns
   the work.
4. **Each of the lower layers has one role.** A profile sets limits, a
   procedure gives steps, a reference gives data, and a checklist confirms. A
   file that does two of these is two files.
5. **A checklist item does not teach.** If an item needs an explanation, the
   procedure above it is incomplete.

## L0: the system prompt

**Owning question:** how does a turn work in this runtime?

The runtime loads it once per session. It contains only the mechanics of a
session: turns, tool calls, and the signal that ends the work. It contains no
project context and no domain knowledge.

You never edit this layer. An interactive coding tool ships its own system
prompt, and an unattended agent runtime supplies its own. That runtime decides
how to combine the persona and the session mechanics into one prompt, so your
profile source contains no composition markers. See
[Coordinate an Agent Team](https://www.gemba.team/docs/coordinate-team/) for one
runtime that does this.

**When it goes wrong.** A general instruction competes with your specific one,
and the agent follows the general habit. Fix this at L5. Complete the procedure
until the runtime's generic advice has nothing left to decide.

## L1: project identity

**Owning question:** what is this project, who does it serve, and where do
things live?

The artifact is `CLAUDE.md` at your repository root. It auto-loads on every run,
which makes it the most expensive file in the architecture. Subdirectory
`CLAUDE.md` files hold the conventions of one directory and load only when work
enters that directory. A good root file has four properties:

- **It gives orientation only.** It says what the project is, who it serves,
  and where things are. Put the rules in `CONTRIBUTING.md`.
- **It is a navigation hub.** It points at everything and repeats nothing. A
  link takes one line. A duplicate is a second copy that you must keep current.
- **It is stable.** If the file changes often, some of its content belongs in a
  deeper layer.
- **It shows the discovery conventions.** It is the one layer that loads on
  every run, so it tells the reader how to find the tagged artifacts everywhere
  else. Say where the jobs are, then give the searches exactly as shown:

```sh
rg '<job '                  # Jobs To Be Done entries
rg '<read_do_checklist'     # entry gates
rg '<do_confirm_checklist'  # exit gates
```

A contributor who reads those three lines can reach every job and every pause
point without any knowledge of the directory layout.

A repository structure standard adds its own conventions on top, such as the
directory shape and where the jobs go. See
[the Monorepo Structure Standard](https://www.monorepo.team/) for one example. A
structure standard adds to the properties above and does not replace them.

**When it goes wrong.** The root identity file sets rules. The same policy then
exists here and in `CONTRIBUTING.md`, the two copies disagree, and every run
spends context on a rule that only one workflow needs.

## L2: contribution standards and jobs

**Owning question:** what governs every contribution, and what progress does
each user seek?

Both files load on demand. `CONTRIBUTING.md` sets the rules for how
contributors work: invariants, technical rules, git workflow, and security
policy. A good one has three properties.

- **Rules only.** State what to do and what not to do. The order of steps
  belongs closer to the work.
- **Universal scope.** Every item applies to every contribution. A rule that
  applies to one workflow belongs with that workflow.
- **Verifiable.** A human, a script, or a checklist can check each rule.
  Guidance that no one can check drifts without notice.

`JTBD.md` is the canonical catalog of Big Hires, with one entry for each pair of
persona and outcome. It records the progress each user seeks and the moment that
creates the need. The narrower, repeated jobs are next to the code that serves
them. For the entry structure, the four forces, and the `<job>` tag, see
[Write Jobs To Be Done Entries](/docs/layered-instructions/write-jobs/).

**When it goes wrong.** No one can verify a rule. Two contributors read it two
ways, both believe they followed it, and the same review argument repeats
every month.

## L3: the agent profile

**Owning question:** who is this agent, and what is it allowed to touch?

The artifact is a file such as `.claude/agents/staff-engineer.md`. It has `name`
and `description` front matter, and the agent loader uses that front matter to
recognize a profile. It auto-loads on every run.

It contains the persona, the voice, the skill routing, and the scope
constraints. It contains no steps. One profile holds one persona, because a
mixed persona makes the voice, the scope, and the accountability unclear. The
72-line cap is the smallest in the architecture, because every line loads on
every run of that agent. Keep the scope constraints and the routing, and move
the rest to the skill the profile routes to.

**When it goes wrong.** A profile contains a procedure. Two agents that do the
same kind of work each grow their own copy of the steps, and the copies drift
apart. The same task then runs in two different ways, depending on which agent
picked it up. Move the steps into one skill and route both profiles to it.

## L4: agent references

**Owning question:** what protocol do several agents share?

The artifact is a file such as `.claude/agents/x-team-protocol.md`, in the
same directory as the profiles. Two conventions identify it. It has no `name` or
`description` front matter, and its filename starts with `x-`. The prefix makes
references easy to see in a listing and sorts them last. The `jidoka` checks
read the front matter and not the filename, so keep the two in agreement
yourself. To make a check enforce this, write your own rule module. See
[Enforce Your Repository's Own Invariants](/docs/stop-the-line/write-invariant-rules/).

It contains a protocol that several agents share and that no single skill owns.
Memory, coordination, and approval are the usual three. It loads on demand,
when a profile or a procedure points at it.

Content belongs here when it passes two tests: more than one agent must follow
it, and no single skill can own it. If only one skill needs it, put it in that
skill's `references/` directory. If a profile always needs it, put it in that
profile.

**When it goes wrong.** Only one skill reads a reference. Nothing loads it, no
one notices when it goes stale, and the skill that needed it grows a second
copy.

## L5: the skill procedure

**Owning question:** how does this domain of work get done, start to finish?

The artifact is `SKILL.md` inside a skill directory, such as
`.claude/skills/release-cut/SKILL.md`. It loads once per invocation. It is the
complete instruction set for one domain, and it has four properties:

- **Complete for its domain.** A contributor who follows only this file
  produces correct output. The reader needs no unwritten knowledge.
- **Imperative voice.** It tells the reader what to do. "Rebase on the default
  branch before you open the review" is a procedure. "A branch can be rebased
  before review" is a description, and a description belongs in a lower layer.
- **Decisions only.** It contains the sequence, the reasons, and the judgment
  calls. Templates, worked examples, and lookup tables go to L6.
- **Self-contained at invocation.** The work starts without any other file. A
  contributor may read a reference partway through, but a reference is never a
  prerequisite.

**When it goes wrong.** A procedure that contains its own templates breaks the
cap, and every trim removes real meaning. Split the file by kind of content and
not by size. The decisions stay, and the data moves down.

## L6: skill references

**Owning question:** what data does this procedure consult?

The artifacts are next to the skill, in `references/<name>.md` or as a script in
`scripts/`. They load on demand, when the procedure needs them. They contain
data: templates, worked examples, invariant tables, and lookup data. A reference
states what is true and gives no order of operations. Each reference must be
correct on its own, because stale data is a different class of defect from a
wrong procedure. When a reference outgrows its cap, split it in two and keep
each half correct on its own.

**When it goes wrong.** A reference gives steps. The reader then has two orders
of operation, and no rule says which one wins. A related failure is a reference
that the procedure always needs. That content belongs in the procedure, so move
it up.

## L7: checklists

**Owning question:** did the known step happen?

A checklist is a tagged block inside the file that owns its pause point. A
domain checklist is in that domain's `SKILL.md`, and a universal checklist is in
`CONTRIBUTING.md`. It loads with its file. There are two types, one for each
moment:

| Moment | Type | Purpose |
| --- | --- | --- |
| Before work starts | READ-DO | Load the constraints into memory |
| Before you cross a boundary | DO-CONFIRM | Confirm you missed nothing |

READ-DO items are in sequence, and one missed item sends the whole effort in the
wrong direction. DO-CONFIRM items are independent checks that you confirm after
the work, so the gate does not interrupt the work.

The boundary with L5 is strict. An item that teaches a contributor what to do
belongs in the procedure. An item that only confirms a known step belongs in the
checklist. See
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).
That guide covers the goal statement, the item cap, the tags, and the properties
of a checklist that works.

**When it goes wrong.** An item starts to teach. The list then grows past what
working memory can hold, people tick boxes without reading them, and the gate
catches nothing.

## Choose the layer for a piece of content

Work down this list and stop at the first yes. That layer is the owner.

1. Is it about how the runtime itself behaves? L0, and you do not write it.
2. Does every contributor need it on every run to find their way? L1.
3. Is it a universal rule, or the progress a user seeks? L2.
4. Does it set one agent's persona or scope? L3.
5. Is it a protocol that more than one agent follows? L4.
6. Is it the sequence and the judgment for one domain of work? L5.
7. Is it data that the sequence reads? L6.
8. Does it confirm a step the contributor already knows about? L7.

When two answers seem equally right, two layers are about to overlap. Resolve
that before you write a line. The most common overlap is between L5 and L6, and
one test settles it: text that makes a decision goes into the procedure, and
text that states a fact goes into the reference.

## Localize a defect to one layer

Use this table when an agent run goes wrong.

| Symptom | Layer at fault | The move |
| --- | --- | --- |
| The agent invented a step no one wrote | L5 incomplete | Add the decision to the procedure |
| The agent followed a step that no longer applies | L6 stale | Correct the reference |
| The work was right, but no one ran the release gate | L7 missing | Add one item to the exit gate |
| Two agents did the same job two ways | L3 duplication | Route both profiles to one skill |
| The agent used a generic habit instead of yours | L5 too thin | Complete the procedure so nothing is left to guess |
| The agent ignored the shared memory protocol | L4 not cited | Point the profile at the reference |
| Reviewers disagree about whether the contribution meets a rule | L2 unverifiable | Rewrite the rule so a check can decide |
| No one can find the pause-point checklists | L1 incomplete | Add the discovery searches |

Every row points to one layer. A symptom that does not point to one layer is
itself a finding: two layers contain overlapping content, and that overlap is
the first thing to fix.

## Verify

Run the layer check from your repository root:

```sh
npx jidoka instructions
```

A repository that passes prints one line:

```text
✓ jidoka instructions passed
```

A breach shows the file, the layer, both numbers, and the rule the file broke:

```text
.claude/agents/demo.md
    error  93 lines (max 72, agent profile)     instructions.line-budget
    error  1082 words (max 448, agent profile)  instructions.word-budget

.claude/skills/demo/SKILL.md
  8  error  checklist #1 (do_confirm_checklist) has 11 items (max 9)  L7.too-many-items

✖ 3 problems (3 errors, 0 warnings)
```

Read each finding as a question about where the content belongs. The profile
above contains a procedure that a skill should own. The checklist teaches, and
the extra items show it.

Then confirm the jobs check as well. The bare command runs the layer check and
the jobs check together:

```sh
npx jidoka
```

It does not run your own invariant modules, so add a second call next to it:

```sh
npx jidoka invariants
```

Add both commands to your check task and your CI job. The line then stops at
the first drifted layer instead of at the next bad agent run. See
[Stop the Line on Instruction Drift](/docs/stop-the-line/) for that wiring.

## What's next

<div class="grid">

<!-- part:card:author-a-layer -->
<!-- part:card:write-checklists -->
<!-- part:card:write-jobs -->
<!-- part:card:../stop-the-line -->

</div>

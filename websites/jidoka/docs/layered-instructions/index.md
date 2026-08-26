---
title: Put Your Instructions on One Layered Architecture
description: Give every instruction file one owning question, one load moment, and one budget, so a bad agent run points at exactly one file instead of at a pile of prose.
---

An agent did the wrong thing. You open the agent profile, the skill it ran, two
reference files, and the root `CLAUDE.md`. All five say something about the work
and none is clearly wrong. You cannot tell which file to fix, so you add a
sentence to whichever one you have open. The next run fails in a new way.

This guide gives your instructions a shape that ends that loop. Each file takes
one job, one load moment, and one size it must fit. A failed run then attributes
to a single layer, and the fix has one address.

## Before you start

Adopt the architecture first. The
[getting-started guide](/docs/getting-started/) creates the root files, the
invariant directory, and the wired check. This guide assumes you already have a
root `CLAUDE.md`, a `CONTRIBUTING.md`, and a `JTBD.md`, and that you can run
the check:

```sh
apm install forwardimpact/jidoka-skills
npx @forwardimpact/jidoka instructions
```

## Why one job per layer

The layers rise from most general to most specific. The general ones apply to
every contributor on every run. The specific ones apply to one domain of work,
or to one pause point inside it. A contributor follows the most specific layer
that speaks to the task. That ordering makes a defect attributable.

"Wrong procedure", "stale data", and "missing verification" are three failures
with three different fixes. They stay distinguishable only while three files own
them. Merge a procedure and its lookup table into one file, and a failed run can
no longer say which half was wrong.

Two pairs mirror each other. A profile sets boundaries and an agent reference
supplies the protocols those agents share. A procedure sets steps and a skill
reference supplies the data those steps consult. The bottom three layers share
one folder and still split three ways. L5 is procedural. L6 is declarative. L7
is verificational.

## The eight layers at a glance

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

**Auto-loaded layers pay rent on every run.** The root `CLAUDE.md`, the agent
profile, and the invoked `SKILL.md` enter the context window whether the current
task needs them or not. Every line you add is a line the agent reads on
unrelated work.

**On-demand layers disclose only when cited.** A subdirectory `CLAUDE.md`, an
agent reference, and a skill reference load when someone follows a pointer to
them. Depth is cheap here, so push detail down and leave a pointer up.

A line cap and a word cap gate every file layer, and either breach fails the
check. You do not need to memorize the word caps, because the check prints both
numbers when it fails. The L7 cap counts items instead of lines, because item
count tracks the load on working memory and a wrapped line does not. Treat any
breach as a routing instruction. When a trim loses meaning, the words belong in
another layer.

## The rules that keep layers apart

Five rules do the separating. No check enforces them fully, so they need your
attention while you write.

1. **No layer restates another.** A duplicated sentence has two owners and no
   owner. One copy goes stale and nobody can say which copy is current.
2. **When two layers name the same tool, separate them by voice.** The lower
   layer describes. The higher layer directs. "The search tool lists matches"
   is a description. "Use the search tool to find the stale reference" is a
   direction.
3. **Identity orients. Standards govern. Skills sequence.** `CLAUDE.md` answers
   what, who, and where. `CONTRIBUTING.md` states the rules. The steps live in
   the skill that owns the work.
4. **Profiles bound, procedures step, references supply, checklists confirm.**
   Four verbs, four layers. A file that does two of them is two files.
5. **A checklist item never teaches.** If an item needs an explanation, the
   procedure above it is incomplete.

## L0 — the system prompt

**Owning question:** how does a turn work in this runtime?

The runtime loads it once per session. It carries mechanics only: turns, tool
calls, and the signal that ends the work. It carries no project context and no
domain knowledge.

You never edit this layer. An interactive coding tool ships its own. An
unattended agent runtime supplies its own, and that runtime decides how the
persona and the session mechanics get composed into one prompt. Your profile
source carries no composition markers of its own. See
[Coordinate an Agent Team](https://www.gemba.team/docs/coordinate-team/) for one
runtime that does this.

**The failure you see when it is wrong.** A general instruction competes with
your specific one, and the agent follows the general habit. The fix belongs at
L5. Complete the procedure until the runtime's generic advice has nothing left
to decide.

## L1 — project identity

**Owning question:** what is this project, who does it serve, and where do
things live?

The artifact is `CLAUDE.md` at your repository root. It auto-loads on every run,
which makes it the most expensive file in the architecture. Subdirectory
`CLAUDE.md` files hold directory-local conventions and load only when work
enters that directory. Four properties define a good one:

- **It orients. It does not govern.** Answer what, who, and where. Rules move
  to `CONTRIBUTING.md`.
- **It is a navigation hub.** It points at everything and restates nothing. A
  link costs one line. A duplicate costs an obligation.
- **It is stable.** Frequent churn signals that content belongs deeper.
- **It surfaces the discovery conventions.** It is the one layer that loads
  every run, so it advertises how to find the tagged artifacts everywhere else.
  Name where jobs live, then give the searches verbatim.

```sh
rg '<job '                  # Jobs To Be Done entries
rg '<read_do_checklist'     # entry gates
rg '<do_confirm_checklist'  # exit gates
```

A contributor who reads those three lines reaches every job and every pause
point without knowing the directory layout.

A repository structure standard layers its own conventions on top, such as the
directory shape and how jobs distribute across it. See
[the Monorepo Structure Standard](https://www.monorepo.team/) for one. A
structure standard adds. It never replaces the properties above.

**The failure you see when it is wrong.** A root identity file that governs.
The same policy exists here and in `CONTRIBUTING.md`, the copies disagree, and
every run pays context for a rule one workflow needs.

## L2 — contribution standards and jobs

**Owning question:** what governs every contribution, and what progress does
each user seek?

Both artifacts load on demand. `CONTRIBUTING.md` governs how contributors work:
invariants, technical rules, git workflow, and security policy. Three properties
hold it in place.

- **Rules only.** State what to do and what not to do. Sequencing moves closer
  to the work.
- **Universal scope.** Every item applies to every contribution. A rule that
  fires for one workflow belongs with that workflow.
- **Verifiable.** A human, a script, or a list can check each rule.
  Aspirational guidance drifts unnoticed.

`JTBD.md` is the canonical catalog of Big Hires, with one entry per
persona-outcome pair. It captures the progress each user seeks and the moment
that creates the need. The narrower repeated jobs live next to the code that
serves them. For the entry structure, the four forces, and the `<job>` tag, see
[Write Jobs To Be Done Entries](/docs/layered-instructions/write-jobs/).

**The failure you see when it is wrong.** A rule nobody can verify. Two
contributors read it two ways, both believe they complied, and the review
argument repeats every month.

## L3 — the agent profile

**Owning question:** who is this agent, and what is it allowed to touch?

The artifact is a file such as `.claude/agents/staff-engineer.md`. It carries
`name` and `description` front matter, and that front matter is the classifier
the agent loader uses to recognize a profile. It auto-loads on every run.

It holds persona, voice, skill routing, and scope constraints. It holds no
steps. One profile carries one persona, because a mixed persona leaves voice,
scope, and accountability ambiguous. The 72-line cap is the tightest in the
architecture, and every line of it loads on every run of that agent. Keep the
scope constraints and the routing. Push the rest to the skill the profile
routes to.

**The failure you see when it is wrong.** A profile that carries procedure. Two
agents that do the same kind of work each grow their own copy of the steps, the
copies diverge, and the same task now runs two ways depending on which agent
picked it up. Move the steps into one skill and route both profiles to it.

## L4 — agent references

**Owning question:** what protocol do several agents share?

The artifact is a file such as `.claude/agents/x-memory-protocol.md`, sitting
flat beside the profiles as their sibling. Two conventions identify it. It
carries no `name` or `description` front matter, and its filename starts with
`x-`. The prefix makes references visible in a listing and sorts them last. The
`jidoka` checks read the front matter, never the filename, so keep the two in
agreement yourself. To make a check assert it, write your own rule module. See
[Enforce Your Repository's Own Invariants](/docs/stop-the-line/write-invariant-rules/).

It holds a cross-cutting protocol that no single skill owns. Memory,
coordination, and approval are the usual three. It loads on demand, when a
profile or a procedure points at it.

Two tests place content here. More than one agent must follow it, and no single
skill can own it. Content that fails the first test belongs in one skill's
`references/` directory. Content that a profile always needs belongs inside
that profile.

**The failure you see when it is wrong.** A reference only one skill consults.
Nothing loads it, nobody notices when it goes stale, and the skill that needed
it grows a second copy.

## L5 — the skill procedure

**Owning question:** how does this domain of work get done, start to finish?

The artifact is `SKILL.md` inside a skill directory, such as
`.claude/skills/release-cut/SKILL.md`. It loads once per invocation. It is the
complete instruction set for one domain, and four properties define it:

- **Complete for its domain.** A contributor who follows only this file
  produces correct output. Tribal knowledge is not a prerequisite.
- **Imperative voice.** It directs action. "Rebase on the default branch
  before you open the review" is a procedure. "A branch can be rebased before
  review" describes, and a description belongs lower.
- **Decisions only.** It holds sequence, rationale, and judgment calls.
  Templates, worked examples, and lookup tables move to L6.
- **Self-contained at invocation.** Work starts with no external read. A
  reference gets consulted partway through, and is never a prerequisite.

**The failure you see when it is wrong.** A procedure carrying its own
templates breaches the cap, and every attempted trim removes real meaning. Split
by kind instead of by size. The decisions stay and the data moves down.

## L6 — skill references

**Owning question:** what data does this procedure consult?

The artifacts sit beside the skill, in `references/<name>.md` or as a script in
`scripts/`. They load on demand, when the procedure calls for them. They are
declarative. They hold templates, worked examples, invariant tables, and lookup
data. A reference states what is true. It does not prescribe an order of
operations. Each one must be independently correct, because stale data is a
distinct defect class from a wrong procedure. When a reference outgrows its cap,
split it in two and keep each half correct alone.

**The failure you see when it is wrong.** A reference that prescribes steps.
The reader now has two orders of operation and no rule says which wins. The
related failure is a reference the procedure always needs. That content is
procedure content, so move it up.

## L7 — checklists

**Owning question:** did the step everybody already knows about actually happen?

A checklist is a tagged block inside the file that owns its pause point. A
domain checklist sits in that domain's `SKILL.md`, and a universal one sits in
`CONTRIBUTING.md`. It loads with its file. Two types gate two moments:

| Moment | Type | Purpose |
| --- | --- | --- |
| Before work starts | READ-DO | Load the constraints into memory |
| Before you cross a boundary | DO-CONFIRM | Confirm you missed nothing |

READ-DO items are sequential, and one missed item sends the whole effort in the
wrong direction. DO-CONFIRM items are independent checks confirmed after the
fact, so the gate never interrupts the flow of work.

The boundary with L5 is strict. An item a contributor needs in order to *learn*
what to do belongs in the procedure. An item that only confirms a known step
happened belongs in the checklist. For the goal statement, the item cap, the
tags, and the properties of a checklist that holds, see
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).

**The failure you see when it is wrong.** An item that teaches. The list grows
past working memory, people tick boxes without reading, and the gate catches
nothing.

## Choose the layer for a piece of content

Work down this list and stop at the first yes. That layer is the owner.

1. Is it about how the runtime itself behaves? L0, and you do not write it.
2. Does every contributor need it on every run to find their way? L1.
3. Is it a universal rule, or the progress a user seeks? L2.
4. Does it bound one agent's persona or scope? L3.
5. Is it a protocol that more than one agent follows? L4.
6. Is it the sequence and the judgment for one domain of work? L5.
7. Is it data that the sequence consults? L6.
8. Does it confirm a step the contributor already knows about? L7.

When two answers feel equally right, two layers are about to blur. Resolve it
before you write a line. The most common blur is L5 against L6, and one test
settles it. Text that decides something goes up. Text that states something
goes down.

## Localize a defect to one layer

Run this table when an agent run goes wrong.

| Symptom | Layer at fault | The move |
| --- | --- | --- |
| The agent invented a step nobody wrote | L5 incomplete | Add the decision to the procedure |
| The agent followed a step that no longer applies | L6 stale | Correct the reference |
| The work was right and the release gate got skipped | L7 missing | Add one item to the exit gate |
| Two agents did the same job two ways | L3 duplication | Route both profiles to one skill |
| The agent used a generic habit instead of yours | L5 too thin | Complete the procedure so nothing is left to guess |
| The agent ignored the shared memory protocol | L4 uncited | Point the profile at the reference |
| Reviewers disagree about whether a rule was met | L2 unverifiable | Rewrite the rule so a check can decide |
| Nobody can find the pause-point checklists | L1 incomplete | Add the discovery searches |

The table never says "the instructions are bad". A symptom that will not
resolve to one layer is itself a finding. Two layers hold overlapping content,
and that overlap is the first thing to fix.

## Verify

Run the layer check from your repository root:

```sh
npx @forwardimpact/jidoka instructions
```

A conformant repository prints one line:

```text
✓ jidoka instructions passed
```

A breach names the file, the layer, both numbers, and the rule that fired:

```text
.claude/agents/demo.md
    error  93 lines (max 72, agent profile)     instructions.line-budget
    error  1082 words (max 448, agent profile)  instructions.word-budget

.claude/skills/demo/SKILL.md
  8  error  checklist #1 (do_confirm_checklist) has 11 items (max 9)  L7.too-many-items

✖ 3 problems (3 errors, 0 warnings)
```

Read each finding as a routing question. The profile above is carrying
procedure that a skill should own. The checklist is teaching, and the extra
items are the evidence.

Then confirm the jobs check as well. The bare command runs the layer check and
the jobs check together:

```sh
npx @forwardimpact/jidoka
```

It does not run your own invariant modules, so wire a second call beside it:

```sh
npx @forwardimpact/jidoka invariants
```

Wire both commands into your check task and your CI job. The line then stops on
the first drifted layer instead of at the next bad agent run. See
[Stop the Line on Instruction Drift](/docs/stop-the-line/) for that wiring.

## What's next

<div class="grid">

<!-- part:card:author-a-layer -->
<!-- part:card:write-checklists -->
<!-- part:card:write-jobs -->
<!-- part:card:../stop-the-line -->

</div>

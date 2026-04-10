# Checklists

> "The volume and complexity of what we know has exceeded our individual ability
> to deliver its benefits correctly, safely, or reliably. Knowledge has both
> saved us and burdened us."
>
> — Atul Gawande, _The Checklist Manifesto_

## Why Checklists

Modern software work fails in predictable ways. Not because contributors lack
skill, but because the environment is complex enough that skilled people
routinely skip steps they know by heart. A monorepo with multiple products,
autonomous agents, and dozens of contributors — human and machine — is exactly
this kind of environment. The failure mode is not ignorance; it is inattention
under load.

Atul Gawande studied this pattern across surgery, aviation, and construction. In
every domain, the same finding held: **the biggest gains came not from new
knowledge but from ensuring existing knowledge was consistently applied.** The
tool that achieved this was remarkably simple — a checklist.

Checklists work because they address the two root causes of failure in complex
work:

1. **Errors of omission.** Under pressure or routine, people skip steps. Not
   because they don't know the steps, but because they trust their memory and
   their memory is unreliable. A checklist externalizes memory.

2. **Errors of assumption.** In collaborative environments, each contributor
   assumes someone else handled the prerequisite. A shared checklist makes the
   handoff explicit.

The insight is counterintuitive: the more expert the team, the more a checklist
helps. Beginners follow procedures because they have to. Experts skip them
because they think they don't need to — and that is when errors creep in. A
checklist is not training material. It is a safety net for competent people
operating in a demanding environment.

## Two Types

Gawande identifies two distinct checklist types, each suited to a different
moment in a workflow. Using the wrong type at the wrong moment undermines the
checklist's purpose.

### READ-DO

**Read each item, then do it.** The contributor works through the list in order,
performing each step immediately after reading it.

Use READ-DO when:

- The work is about to begin and the contributor needs to internalize
  constraints before writing the first line.
- The steps are sequential or the items form a set of principles that must all
  be held in mind simultaneously.
- Missing any single item would send the work in the wrong direction.

READ-DO checklists are **entry gates**. They prevent bad starts. A contributor
who skips the READ-DO and jumps straight to coding will produce work that must
be reworked — not because the code is wrong in isolation, but because it
violates constraints that should have been loaded into working memory first.

### DO-CONFIRM

**Do from memory, then pause and confirm every item.** The contributor works
freely, relying on skill and experience. At a defined pause point, they stop and
walk the checklist to verify nothing was missed.

Use DO-CONFIRM when:

- The work is already done (or a natural phase of it is complete) and the
  contributor needs to verify completeness before proceeding.
- The items are independent checks, not sequential steps.
- Skilled contributors should work fluidly, not be interrupted mid-flow.

DO-CONFIRM checklists are **exit gates**. They catch omissions before the work
crosses a boundary — before a commit, before a merge, before a release. They
trust the contributor's competence during the work and verify its completeness
afterward.

### The Distinction Matters

Confusing the two types is the most common checklist design error. A READ-DO
list used as a post-hoc confirmation check is too late — the damage is done. A
DO-CONFIRM list forced on every micro-step is too early — it fragments flow and
gets ignored. Match the type to the moment:

| Moment                   | Type       | Purpose                      |
| ------------------------ | ---------- | ---------------------------- |
| Before starting work     | READ-DO    | Load constraints into memory |
| Before crossing boundary | DO-CONFIRM | Verify nothing was missed    |

## Tagging Checklists in Instructions

A checklist embedded in prose — a contributing guide, a skill definition, an
agent profile — is easy to miss. It blends into the surrounding text. A human
skimming the document may not realize they have passed a checklist. An agent
parsing the document has no structural signal to distinguish a checklist from
advisory prose.

We solve this by wrapping each checklist in a semantic tag that encodes its type
and states its goal:

```
<read_do_checklist goal="Internalize constraints before writing code">

- [ ] First constraint to internalize before starting.
- [ ] Second constraint.

</read_do_checklist>
```

```
<do_confirm_checklist goal="Verify completeness before committing">

- [ ] First verification to confirm before proceeding.
- [ ] Second verification.

</do_confirm_checklist>
```

The tags serve three purposes:

**1. They make the type unambiguous.** A checklist's type is not a matter of
interpretation — it is declared in the tag name. Any contributor, human or
agent, encountering a `<read_do_checklist>` tag knows the protocol: read each
item, then do it. A `<do_confirm_checklist>` tag means: do from memory, then
pause and confirm. There is no room for the most common design error — confusing
which type applies.

**2. They create a structural boundary.** Tags separate the checklist from
surrounding instructional text. A contributor scanning a long document can
locate every checklist by searching for the tags. An agent's attention is drawn
to the tagged block as a distinct unit requiring a specific protocol, not just
another paragraph of guidance to weigh and possibly skip. Without a boundary,
checklists dissolve into the document and lose their forcing-function quality.

**3. They enable discovery.** Because the tags are standardized across all
instruction documents — contributing guides, skill definitions, agent profiles —
a single `rg` invocation finds every checklist in the codebase:

```sh
rg '<read_do_checklist'     # all entry gates
rg '<do_confirm_checklist'  # all exit gates
```

The `goal` attribute (§ Goal Statement) makes these results self-describing —
each matched line shows the checklist's type and the outcome it protects,
without opening the file. You cannot improve what you cannot find, and you
cannot triage what you cannot read at a glance.

### Convention Rules

- Every checklist must be wrapped in its type tag. An untagged checklist is
  ambiguous — the reader does not know whether to READ-DO or DO-CONFIRM.
- The tag name encodes the type. Do not use a generic `<checklist>` tag.
- Every opening tag must include a `goal` attribute stating the outcome the
  checklist protects (§ Goal Statement). Keep it short enough that the full
  opening tag fits on one line (formatters wrap long lines, breaking the
  single-line grep benefit).
- Items inside the tags use markdown checkbox syntax (`- [ ]`).
- The tags are structural markers, not rendered elements.

### Placement

READ-DO checklists belong **at the top** of the instruction document or
procedure section — before any steps. They are entry gates; a contributor who
reads past them has already started forming an approach that may violate the
constraints.

DO-CONFIRM checklists also belong **at the top**, right after any READ-DO list.
The checklist is _used_ at the end, but the contributor benefits from seeing it
before starting — knowing what you will be verified against shapes how you work.
The exception is a mid-procedure pause point (e.g., a pre-flight check before a
specific phase), where placement at the pause point is correct.

## What Good Checklists Look Like

Gawande distilled the properties of effective checklists from studying failures
across industries. A checklist that violates these properties will be ignored,
worked around, or followed mechanically without effect.

### Goal Statement

Every checklist begins with a stated goal — the outcome it exists to protect.
Gawande drew this from aviation and surgery: before running items, the team
states the objective. The goal orients the contributor on _why_ these items
matter, turning a rote sequence into a purposeful act. A checklist without a
stated goal invites mechanical compliance — checking boxes without engaging with
what they protect.

### Short

A good checklist has **5 to 9 items**. This is not arbitrary — it reflects the
limits of working memory. Beyond 9 items, contributors start skipping entries or
treating the checklist as a bureaucratic formality rather than a cognitive aid.
If a checklist exceeds 9 items, it is trying to do too much. Split it, or
question whether every item earns its place.

### Precise

Each item must be **a single, unambiguous action or verification**. Vague items
("ensure quality") are worse than no checklist at all — they give the illusion
of rigor while checking nothing. A good item names exactly what to do or what to
confirm, in language specific enough that two contributors would interpret it
the same way.

### Practical

A checklist is not a textbook. It does not teach the contributor how to do the
work — it assumes competence and reminds them of the steps most likely to be
skipped. Gawande calls these **killer items**: the steps that are easy to miss
and consequential when missed. A checklist full of obvious steps wastes
attention on things no one forgets, leaving no room for the things they do.

### Tested in the Real World

Checklists must be tested against actual work, not designed in theory. The only
way to know if a checklist works is to use it, observe what still goes wrong,
and revise. Every effective checklist went through multiple iterations driven by
real-world use.

### Tied to a Specific Pause Point

A checklist without a defined trigger won't be used. The most effective
checklists are tied to a **natural pause point** — a moment where stopping is
already expected. Before intubation. Before takeoff. Before commit. If the pause
point is artificial, contributors will skip the list.

### Kept Up to Date

A stale checklist is actively harmful — it trains contributors to treat
checklists as noise. When the work changes, the checklist must change with it.
Remove items that no longer catch errors; add items for new failure modes.

## Checklists and Agents

Everything above applies equally to human contributors and autonomous agents.
Agents face the same failure modes — omission under complexity, assumptions
about prior state, skipped steps in long procedures — and benefit from the same
countermeasure.

There is one critical difference: agents follow checklists literally. A human
reads "verify CI passes" and knows to check the status page. An agent needs the
exact command. This makes precision even more important for agent-facing
checklists, but does not change the underlying design principles.

The two-type model applies directly:

- **READ-DO for agents** means: load these constraints into context before
  generating any code or taking any action. The agent reads the full list and
  holds every item as an active constraint.
- **DO-CONFIRM for agents** means: after completing the work phase, walk every
  item and verify. If any item fails, stop and remediate before proceeding.

The tagging convention (§ Tagging Checklists in Instructions) is particularly
valuable here — tags give agents an unambiguous structural signal, so the same
tagged checklist serves both human and agent contributors.

## Principles for Checklist Authoring

Drawing from Gawande's findings, effective checklists in a complex codebase
follow these principles:

1. **One checklist, one moment.** Each checklist is tied to a single pause point
   in a specific workflow. A checklist that tries to cover multiple moments will
   be too long and too vague.

2. **Killer items only.** Every item must address a failure mode that has
   actually occurred or is highly likely to occur. Do not add items preventively
   — add them in response to observed errors.

3. **Action or verification, never explanation.** A checklist item is a verb
   phrase, not a paragraph. If the item needs a paragraph of explanation, the
   contributor is not ready for the checklist — they need training first.

4. **Fits on one page.** If printing the checklist takes more than one page, it
   is too long. This is a forcing function for brevity.

5. **Tested and revised.** A checklist is a living document. Review it on a
   regular cadence. Remove items that never catch errors. Add items for failure
   modes discovered in practice. The revision cycle is as important as the
   initial design.

6. **Owned, not orphaned.** Every checklist has a clear owner — a person or
   process responsible for keeping it current. An unowned checklist decays into
   irrelevance.

## Using This Document

This document explains the approach — shared vocabulary and design principles
for reviewing, revising, or creating checklists. Use it as input when:

- Reviewing an existing checklist for effectiveness.
- Designing a new checklist for a workflow.
- Deciding whether a proposed checklist item earns its place.
- Evaluating whether a checklist is the right tool for a given problem (as
  opposed to automation, training, or architectural change).

# Checklists

> "The volume and complexity of what we know has exceeded our individual ability
> to deliver its benefits correctly, safely, or reliably."
>
> — Atul Gawande, _The Checklist Manifesto_

## Why Checklists

Complex work fails not from ignorance but from inattention under load. Skilled
contributors skip steps they know by heart. A monorepo with multiple products,
autonomous agents, and dozens of contributors is exactly this environment.

Gawande's finding across surgery, aviation, and construction: **the biggest
gains came not from new knowledge but from ensuring existing knowledge was
consistently applied.**

Checklists address two root causes of failure:

1. **Errors of omission.** Under pressure, people skip steps they know. A
   checklist externalizes memory.
2. **Errors of assumption.** Each contributor assumes someone else handled the
   prerequisite. A shared checklist makes the handoff explicit.

The insight is counterintuitive: the more expert the team, the more a checklist
helps. Beginners follow procedures because they must. Experts skip them because
they think they don't need to — and that is when errors creep in.

## Two Types

Gawande identifies two checklist types, each suited to a different moment. Using
the wrong type at the wrong moment undermines the checklist's purpose.

### READ-DO — Entry Gates

**Read each item, then do it.** Use before work begins — when the contributor
needs to internalize constraints before writing the first line.

Use READ-DO when:

- Steps are sequential or form principles that must all be held in mind.
- Missing any single item would send the work in the wrong direction.

### DO-CONFIRM — Exit Gates

**Do from memory, then pause and confirm every item.** Use at natural pause
points — before a commit, merge, or release.

Use DO-CONFIRM when:

- A work phase is complete and the contributor needs to verify completeness.
- Items are independent checks, not sequential steps.
- Skilled contributors should work fluidly, not be interrupted mid-flow.

### The Distinction Matters

A READ-DO used post-hoc is too late — the damage is done. A DO-CONFIRM forced
on every micro-step fragments flow and gets ignored.

| Moment                   | Type       | Purpose                      |
| ------------------------ | ---------- | ---------------------------- |
| Before starting work     | READ-DO    | Load constraints into memory |
| Before crossing boundary | DO-CONFIRM | Verify nothing was missed    |

## Tagging Convention

Wrap each checklist in a semantic tag that encodes its type and states its goal:

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

Tags serve three purposes:

1. **Unambiguous type.** The tag name declares READ-DO or DO-CONFIRM — no
   interpretation needed.
2. **Structural boundary.** Separates the checklist from surrounding prose so it
   cannot dissolve into advisory text and lose its forcing-function quality.
3. **Discovery.** Standardized tags enable codebase-wide search:

```sh
rg '<read_do_checklist'     # all entry gates
rg '<do_confirm_checklist'  # all exit gates
```

The `goal` attribute makes results self-describing — each match shows type and
protected outcome without opening the file.

### Rules

- Every checklist must be wrapped in its type tag. An untagged checklist is
  ambiguous — the reader does not know whether to READ-DO or DO-CONFIRM.
- Do not use a generic `<checklist>` tag. The tag name encodes the type.
- Every opening tag must include a `goal` attribute stating the protected
  outcome. Keep it short enough that the full tag fits on one line (preserves
  grep benefit).
- Items use markdown checkbox syntax (`- [ ]`).

### Placement

Both types belong **at the top** of the instruction section — READ-DO first,
then DO-CONFIRM. The DO-CONFIRM is _used_ at the end, but seeing it before
starting shapes how you work. Exception: mid-procedure pause points place the
DO-CONFIRM at the pause point.

## Properties of Good Checklists

Drawing from Gawande's findings, effective checklists share these properties:

1. **Goal statement.** Every checklist begins with a stated goal — the outcome
   it protects. Without a goal, compliance becomes mechanical box-checking.

2. **5–9 items.** This reflects working memory limits. Beyond 9 items,
   contributors skip entries or treat the list as bureaucratic formality. If a
   checklist exceeds 9 items, split it or question whether every item earns its
   place.

3. **Precise.** Each item is a single, unambiguous action or verification. Vague
   items ("ensure quality") give the illusion of rigor while checking nothing.
   Two contributors should interpret each item the same way.

4. **Killer items only.** Every item must address a failure mode that has
   actually occurred or is highly likely to occur. Include steps that are easy to
   miss and consequential when missed. A list full of obvious steps wastes
   attention on things no one forgets.

5. **Action or verification, never explanation.** A checklist item is a verb
   phrase, not a paragraph. If it needs explanation, the contributor needs
   training — not a longer checklist.

6. **One checklist, one moment.** Each checklist is tied to a single pause point
   in a specific workflow. A checklist that covers multiple moments will be too
   long and too vague. The pause point must be natural — a moment where stopping
   is already expected. If the pause point is artificial, the list gets skipped.

7. **Tested and revised.** A checklist is a living document. Use it, observe
   what still goes wrong, revise. Remove items that never catch errors; add
   items for new failure modes. A stale checklist trains contributors to treat
   checklists as noise.

8. **Owned.** Every checklist has a clear owner — a person or process
   responsible for keeping it current. An unowned checklist decays into
   irrelevance.

## Agents

Everything above applies equally to autonomous agents. They face the same
failure modes — omission under complexity, assumptions about prior state, skipped
steps — and benefit from the same countermeasure.

One critical difference: agents follow checklists literally. A human reads
"verify CI passes" and knows to check the status page. An agent needs the exact
command. This makes precision even more important for agent-facing checklists.

- **READ-DO for agents:** load all constraints into context before generating
  code or taking any action.
- **DO-CONFIRM for agents:** after completing the work phase, walk every item
  and verify. If any item fails, remediate before proceeding.

The tagging convention is particularly valuable here — tags give agents an
unambiguous structural signal, so the same tagged checklist serves both human
and agent contributors without modification.

## Using This Document

This document defines shared vocabulary and design principles for checklists.
Use it when reviewing, revising, or creating checklists — or when deciding
whether a checklist is the right tool for a given problem (vs. automation,
training, or architectural change).

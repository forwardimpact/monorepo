---
title: Choose and Scope Your Agent Roster
description: Decide which agent personas run in your repository, and write the scope constraints that turn an out-of-scope finding into a spec instead of an unreviewed fix.
---

You installed the pack, and a first shift ran green. Now you decide who is on
the team. A roster is a set of persona files in your own repository. Each file
defines one agent, grants it a set of skills, and states what the agent must
not do. This page covers that task. It ends when every phase of your cycle has
an owner and every persona has a written boundary.

## Prerequisites

- Read [Run a Continuously Improving Agent Team](/docs/continuous-improvement/).
  This page assumes the cycle already runs.
- Install the packs: `apm install forwardimpact/kata-skills` and
  `apm install forwardimpact/gemba-skills`.
- Know the persona names your shift workflow lists today. See
  [Getting Started: Your First Kata Shift](/docs/getting-started/).

## What a persona file declares

Each persona is one markdown file at `.claude/agents/<name>.md` in your
repository. The packs ship default profiles. You can copy one and edit it, or
write your own. Every profile has the same shape. The front matter declares the
identity and grants the skills:

```markdown
---
name: security-engineer
description: >
  Repository security engineer. Patches dependencies, triages dependency
  update pull requests, and enforces dependency policy.
skills:
  - kata-security-update
  - kata-security-audit
  - kata-spec
  - kata-review
  - kata-session
---
```

The body then has three sections.

- **Identity and voice.** A short character sketch that sets what the agent
  notices first. A tidy persona notices the third copy of a helper, and a
  cautious persona notices an open port. The sketch changes what the agent
  reports, so write it with care.
- **Session protocol.** An `Every Run` block lists the memory the agent reads
  before any work. An `Assess` block is a numbered priority list, and the agent
  takes the first entry that has work to do. It skips `Assess` when a human
  gives it a specific task.
- **Constraints.** The scope boundary. When this section is empty, the team
  fails.

Keep every profile short. A profile is an instruction layer, and each layer has
a length cap. See
[Author or Repair One Instruction Layer](https://www.jidoka.team/docs/layered-instructions/author-a-layer/).

## Cover every phase of the cycle

A phase with no owner breaks the cycle without an error message. The work stops
arriving. Check your roster against the phases before you tune anything else.

| Phase | What the phase must produce | Default profile to start from |
| --- | --- | --- |
| Plan | An approved spec becomes a design, then an executable plan | `staff-engineer` |
| Do | A plan becomes merged code, and merged code becomes a release | `staff-engineer`, `release-engineer`, `security-engineer` |
| Study | Someone reads the output back and produces findings | `product-manager`, `security-engineer`, `technical-writer`, `improvement-coach` |
| Act | Each finding becomes a fix or a spec | `product-manager`, `security-engineer`, `technical-writer` |

Teams often forget Study, and without it the team ships all day and learns
nothing. Teams also tend to leave Act half done, so the findings pile up as
comments and stay there.

The shift runs the roster in the order you declare it, one agent at a time.
Order the list as a chain: the persona that opens work first, the persona that
reviews in the middle, and the persona that ships last. Each agent then works
on the output that the previous agent produced in the same shift.

Do not start with a full roster. Start with one producer, one reviewer, and one
shipper, and run that for a week. Add a Study persona when the team produces
enough output to read back.

## Grant the smallest useful skill set

The `skills` list defines what the persona can do. Grant a skill when the
`Assess` list routes to it. Most profiles grant these groups.

- **Domain skills.** One or two, and they cover the work that the persona owns.
- **The spec skill.** Any persona that can find a structural problem needs it.
  Without it, the persona has no way to write up a finding, and the scope rule
  below has no exit.
- **The review and session skills.** Review lets the persona sit on a panel for
  another agent's work. Session lets the coach facilitate a session with it.

Grant the merge skill and the release skill to one persona only.

## Write the scope constraints

Every profile ends with a `Constraints` section. Write three kinds of line in
it: what the persona owns, what the persona must never do and which persona
owns that work instead, and where each kind of work goes.

```markdown
### Constraints

- Audit code health and review maintainability. Nothing else.
- A cleanup changes no behavior. A structural refactor routes to a spec.
- Mechanical fix: a `fix/<topic>-YYYY-MM-DD` branch from `main`.
- Structural finding: a spec on a `spec/<topic>` branch from `main`.
- Never fold a refactor into a cleanup pull request.
- Never push to `main`.
```

The negative lines are the important ones. A persona that knows only what it
owns will expand until it owns everything.

## Write up a problem outside the boundary

A scoped roster gives you one main benefit. An agent that finds a problem
outside its own boundary writes the problem up, and it leaves the fix to the
owner.

Give every persona the same test.

- **Mechanical.** The fix is clear and bounded. It does not replace
  architecture, add a component or a contract, or cross a scope boundary. The
  finding becomes a fix pull request.
- **Structural.** The finding needs a design decision, changes a component or
  a contract, or is outside the boundary of the agent that found it. The
  finding becomes a spec.
- **Tie-breaker.** If you cannot describe the change as one verifiable diff
  until someone makes a design decision, treat it as structural.

Without this test, the following happens. An agent runs a cleanup pass and
finds a real architectural problem. Its `Constraints` section says nothing
about scope, so it rewrites the component inside the cleanup pull request. The
diff now mixes a cleanup that changes no behavior with a redesign that no one
asked for.

A reviewer cannot approve half a diff, so the whole change waits. Meanwhile,
the design decision inside it never reached a spec, a design review, or a
human. The team has lost the finding and now has a stalled pull request as
well.

## Choose one merge authority

One persona holds the merge gate, and it is the only persona that pushes to
`main`. Every other persona opens a pull request and waits. Set that boundary
in two places: put the gate skills in that persona's `skills` list and nowhere
else, and put a `Never push to main` line in every other profile.

The gate reads the approval state before it merges, and a human writes that
state.
[Set the Approval Gates and Trust Boundary](/docs/spec-to-shipped/approval-gates/)
covers the record it reads.

## Share the rules every persona obeys

Some rules apply to the whole roster, such as how an agent reads memory, which
channel takes which output, and what an agent does when its credentials
expire. Do not copy those rules into each profile. Put each one in a shared
reference file beside the profiles, and link to it from the `Constraints`
section. Then you change one file, and the whole roster follows.

The memory read at boot and the claim written before a pull request both use
the Gemba wiki commands. See
[Set Up Persistent Memory and Metrics](https://www.gemba.team/docs/predictable-team/)
for what those commands do.

## Verify

- Every persona name in your shift workflow resolves to a file at
  `.claude/agents/<name>.md`.
- Every profile has a non-empty `Constraints` section, and every one of those
  sections contains at least one `Never` line.
- Every phase in the table above has at least one persona.
- Exactly one persona may push to `main`.
- Take one real finding from your last shift and read only the owning profile.
  From that profile alone, you can say whether the finding is a fix or a spec.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../findings-to-action -->
<!-- part:card:../daily-storyboard -->
<!-- part:card:../team-memory -->
<!-- part:card:../../spec-to-shipped/approval-gates -->

</div>

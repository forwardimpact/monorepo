---
title: Choose and Scope Your Agent Roster
description: Decide which agent personas run in your repository, and write the scope constraints that turn an out-of-scope finding into a spec instead of an unreviewed fix.
---

You installed the pack and a first shift ran green. Now you decide who is on
the team. A roster is a set of persona files in your own repository. Each file
names one agent, grants it a set of skills, and states what the agent must not
do. This page covers that one task. It ends when every phase of your cycle has
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
repository. The packs ship default profiles. You copy one and edit it, or you
write your own from scratch. Every profile has the same shape.

Front matter declares identity and grants skills:

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

The body then carries three sections.

- **Identity and voice.** A short character sketch. It sets what the agent
  notices first. A tidy persona notices the third copy of a helper. A wary
  persona notices an open port. The sketch changes what the agent reports, so
  write it on purpose.
- **Session protocol.** An `Every Run` block names the memory the agent reads
  before any work. An `Assess` block is a numbered priority list. The agent
  takes the first entry that has actionable work. It skips `Assess` when a
  human hands it a specific task.
- **Constraints.** The scope boundary. This section is the one that fails the
  team when it is empty.

Keep every profile short. A profile is an instruction layer, and layers carry
length caps. See
[Author or Repair One Instruction Layer](https://www.jidoka.team/docs/layered-instructions/author-a-layer/).

## Cover every phase of the cycle

A phase with no owner breaks the cycle quietly. Nothing errors. The work stops
arriving. Check your roster against the phases before you tune anything else.

| Phase | What the phase must produce | Default profile to start from |
| --- | --- | --- |
| Plan | An approved spec becomes a design, then an executable plan | `staff-engineer` |
| Do | A plan becomes merged code, and merged code becomes a release | `staff-engineer`, `release-engineer`, `security-engineer` |
| Study | Someone reads the output back and produces findings | `product-manager`, `security-engineer`, `technical-writer`, `improvement-coach` |
| Act | Each finding becomes a fix or a spec | `product-manager`, `security-engineer`, `technical-writer` |

Study is the phase teams forget. Without it the team ships all day and learns
nothing. Act is the phase teams half-finish. Findings then pile up as comments
and die there.

The shift runs the roster in declaration order, one agent at a time. Order the
list as a chain. Put the persona that opens work first. Put the persona that
reviews in the middle. Put the persona that ships last. Each agent then works
on output the previous agent produced in the same shift.

Do not start with a full roster. Start with one producer, one reviewer, and one
shipper. Run that for a week. Add a Study persona once the team produces output
worth reading back.

## Grant the smallest useful skill set

The `skills` list is the persona's capability surface. Grant a skill when the
`Assess` list routes to it. Most profiles grant these groups.

- **Domain skills.** One or two. They carry the work the persona owns.
- **The spec skill.** Any persona that can find a structural problem needs it.
  Without it the finder has no way to write a finding up, and the scope rule
  below has no exit.
- **The review and session skills.** Review lets the persona sit on a panel for
  another agent's work. Session lets the coach facilitate it.

Grant the merge skill and the release skill to one persona only.

## Write the scope constraints

Every profile ends with a `Constraints` section. Write three kinds of line in
it. State what the persona owns. State what the persona must never do, and name
the neighbour that owns it instead. State where each kind of work lands.

```markdown
### Constraints

- Audit code health and review maintainability. Nothing else.
- A cleanup changes no behavior. A structural refactor routes to a spec.
- Mechanical fix: a `fix/<topic>-YYYY-MM-DD` branch from `main`.
- Structural finding: a spec on a `spec/<topic>` branch from `main`.
- Never fold a refactor into a cleanup pull request.
- Never push to `main`.
```

The negative lines carry the weight. A persona that knows only what it owns
will expand until it owns everything.

## The finder is not the doer

This rule is what the roster buys you. An agent that finds a problem outside
its own boundary writes the problem up. It does not fix the problem in place.

Give every persona the same test to apply.

- **Mechanical.** The resolution is clear and bounded. It replaces no
  architecture. It adds no component and no contract. It crosses no scope
  boundary. The finding becomes a fix pull request.
- **Structural.** The finding needs a design decision, it changes a component
  or a contract, or it exceeds the boundary of the agent that found it. The
  finding becomes a spec.
- **Tie-breaker.** You cannot state the change as one verifiable diff until
  someone makes a design decision. Treat it as structural.

Here is the failure you hit when you skip this. An agent runs a cleanup pass
and finds a real architectural problem. Its `Constraints` section says nothing
about scope. So it rewrites the component inside the cleanup pull request. The
diff now mixes a no-behavior-change cleanup with a redesign nobody asked for.
A reviewer cannot approve half a diff, so the whole change waits. Meanwhile the
design decision inside it never reached a spec, a design review, or a human.
The team lost the finding and gained a stalled pull request.

## Name one merge authority

One persona holds the merge gate. It is the only persona that pushes to `main`.
Every other persona opens a pull request and waits. Set that boundary in two
places. Put the gate skills in that persona's `skills` list and nowhere else.
Put a `Never push to main` line in every other profile.

The gate reads approval state before it merges, and a human writes that state.
[Set the Approval Gates and Trust Boundary](/docs/spec-to-shipped/approval-gates/)
covers the record it reads.

## Share the rules every persona obeys

Some rules apply to the whole roster. How an agent reads memory. Which channel
carries which output. What an agent does when its credentials expire. Do not
copy those rules into each profile. Put each one in a shared reference file
beside the profiles, then link to it from the `Constraints` section. You then
change one file and the whole roster changes with it.

The memory read at boot and the claim write before a pull request both run
through the Gemba wiki commands. See
[Set Up Persistent Memory and Metrics](https://www.gemba.team/docs/predictable-team/)
for what those commands do.

## Verify

- Every persona name in your shift workflow resolves to a file at
  `.claude/agents/<name>.md`.
- Every profile has a non-empty `Constraints` section, and every one of those
  sections contains at least one `Never` line.
- Every phase in the table above has at least one persona.
- Exactly one persona may push to `main`.
- Take one real finding from your last shift. Read the owning profile alone.
  You can say from that profile whether the finding is a fix or a spec.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../findings-to-action -->
<!-- part:card:../daily-storyboard -->
<!-- part:card:../team-memory -->
<!-- part:card:../../spec-to-shipped/approval-gates -->

</div>

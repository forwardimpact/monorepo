# Spec 1640 — Outpost brief mode separated from draft-on-behalf at init

## Why

**Persona / job.** Empowered Engineers hire Outpost for _Be Prepared and
Productive_
([JTBD.md § Empowered Engineers: Be Prepared and Productive](../../JTBD.md#empowered-engineers-be-prepared-and-productive)).
The job's declared **anxiety** force, verbatim from the canonical JTBD doc and
the source of truth in
[products/outpost/package.json](../../products/outpost/package.json)
(`jobs[0].forces.anxiety`):

> _"Delegating awareness to a system feels like losing control."_

**Evidence.** Issue
[#1503](https://github.com/forwardimpact/monorepo/issues/1503) recorded the
third independent landing-page bounce reason from `kata-interview run-8` (JTBD
switching interview against the Outpost landing page; Empowered Engineers / Be
Prepared and Productive). The persona's words:

> _"I'm about to delegate the 'what each person owes me / what I owe them'
> awareness layer to a system that drafts replies on my behalf. I need to figure
> out the read-only-brief vs. draft-on-my-behalf line before I turn this on, not
> after. Today I wanted just the brief side."_

The anxiety fires **at the landing page, before `init`** — distinct from the
platform anxiety (issue
[#1500](https://github.com/forwardimpact/monorepo/issues/1500), addressed by PR
[#1504](https://github.com/forwardimpact/monorepo/pull/1504), both closed
2026-06-08) and the data-residency anxiety (issue
[#1501](https://github.com/forwardimpact/monorepo/issues/1501), separate spec in
flight).

**Why this isn't a runtime toggle.** A scheduler-config flag the user discovers
_after_ `init` does not address the force: by then the anxiety has either
blocked adoption or been suppressed. The trust contract is evaluated at install
time.

## What

At install time, Outpost offers two named adoption postures and persists the
choice so the scheduler honours it on every subsequent wake.

The recorded posture changes only via user-initiated affordances — `init`'s
default recording and SC5's one-shot affordance; no wake, scheduled or
user-initiated, may alter it. This invariant is load-bearing rather than
implied: the posture record lives under `~/.fit/outpost/`, inside the boundary
rule's clause-1 permitted write zone, so an agent that (mis)wrote it would
otherwise self-promote from `brief` to `brief+draft` with every other criterion
still passing (SC12).

The two postures are **`brief`** and **`brief+draft`**. These exact strings are
the user-visible identifiers in CLI flags, `fit-outpost status` output, and the
landing-page copy.

### Boundary rule

A bundled skill is **brief-eligible** if and only if **both** of these hold:

1. Every artefact it writes is owned by Outpost — i.e. lands inside one of the
   configured knowledge base paths (each agent's configured KB path, whether
   established at `init` or edited afterwards in the scheduler configuration),
   `~/.fit/outpost/`, or `~/.cache/fit/outpost/`.
2. It does not produce content authored on behalf of the user that is intended
   for delivery to a third party, regardless of where that content is staged. A
   markdown draft of an email response composed as the user, staged locally
   under the knowledge base, fails this clause.

A bundled skill is **draft-side** if it fails either clause. Examples
illustrating each clause:

- Fails (1): a skill that reorganises files in the user's Documents tree outside
  every configured knowledge base path, or writes a PDF to the user's Downloads
  folder. (On a default install the knowledge base itself lives inside
  Documents; writes within a configured KB path satisfy clause 1.)
- Fails (2): a skill that drafts an email response under the user's name for the
  user to approve and send, even when the draft is staged as a local markdown
  file; or a skill that sends a chat message via browser automation against a
  third-party web app on the user's behalf.

The **brief posture** runs only brief-eligible skills. The **brief+draft
posture** runs every bundled skill — it is the no-suppression baseline.

The posture governs agent behaviour, not merely skill availability. Outpost
agents are prompt-directed: an agent definition can direct draft-side output
(e.g. "drafts replies") independently of which skills it may invoke. Every
surface that directs an agent toward draft-side output — skill bindings and
agent definition prose alike — is therefore bound by the recorded posture.

The design produces the membership table by applying this rule to each bundled
skill's outbound surface (its `SKILL.md` prose and the agents that bind it). The
table is a design deliverable, not part of this spec.

### Default

The **default posture for a fresh `init` is `brief`**. The trust contract is
opted into, not opted out of.

### Upgrade

Three decisions govern installs upgrading from a pre-spec-1640 release:

- An upgraded install on which no posture has been recorded behaves as `brief`
  until the user records one — the **interim window**. Silent inheritance of
  draft-side behaviour is rejected: the persona's framing is _"figure out the
  line before I turn this on, not after."_
- The upgrade path offers a discoverable, one-shot affordance for recording a
  posture (SC5). Steady-state switching of a recorded posture stays out of
  scope.
- Migration never silently flips the user's existing configuration in either
  direction (SC9, SC10).

## Success criteria

Definitions used by the criteria:

- **Wake** — any agent invocation, whether scheduled by the daemon or
  user-initiated.
- **Artefact** — any content a wake produces, including content delivered to an
  external surface (a chat message sent via browser automation is an artefact),
  not only files written locally.
- **Interim window** — from the first post-upgrade wake until a posture is
  recorded; governed by SC1 and excluded from SC10's invariant.
- **Migration-step exit** — the moment the migration step completes, before any
  subsequent wake.
- **Pre-migration point** — the scheduler configuration and per-agent skill
  availability as they stood immediately before the migration step runs.
- **Post-migration point** — per-agent skill availability at the first wake
  after a posture is recorded via SC5's affordance.
- **Observation window** — at least one completed scheduled wake for every
  enabled agent (per-agent schedules differ; the daemon's poll loop is not the
  unit).

SC7 and SC8 are reviewable from the tree today; the remaining criteria are
implementation-time checks. SC3 and SC3-fixture bind to the design's membership
table, which the design publishes as part of its deliverable.

| #           | Claim                                                                                                                                             | Verifier                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1         | During the interim window, no wake produces a draft-side artefact.                                                                                | Applying the §What boundary rule to every artefact produced by scheduled and user-initiated wakes in the interim window classifies none as draft-side.                                                                                                            |
| SC2         | The selected posture persists across daemon restarts.                                                                                             | After a posture is recorded, `fit-outpost status` reports the same posture (per SC6) after a full daemon stop and restart, without any further user input.                                                                                                        |
| SC3         | Under **`brief`**, no scheduled wake produces a draft-side artefact.                                                                              | Applying the §What boundary rule to every artefact produced across one observation window under `brief` against the SC3 fixture classifies none as draft-side.                                                                                                    |
| SC3-fixture | The SC3 fixture exercises at least one input per bundled skill that the design's membership table classifies as draft-side.                       | Implementation-time check: the fixture's inputs are enumerated against the design's published membership table, which this SC binds the design to publish.                                                                                                        |
| SC4         | Under **`brief+draft`**, no bundled skill is suppressed.                                                                                          | Configuration assertion: the posture gating applies no suppression under `brief+draft`, so every skill bound by any bundled agent definition remains available to that agent.                                                                                     |
| SC5         | A posture-less upgraded install offers a discoverable, one-shot affordance for recording a posture.                                               | The post-upgrade `fit-outpost --help` output documents the affordance, and exercising it once yields a recorded posture observable per SC6.                                                                                                                       |
| SC6         | The active posture is observable via `fit-outpost status` as one of the two committed strings, once recorded.                                     | After a posture has been recorded, `fit-outpost status` plain-text output includes a line matching `^posture: (brief\|brief\+draft)$`; before any posture has been recorded, the line is either absent or reads `posture: unset`.                                 |
| SC7         | The Outpost landing page introduces the two postures by name, before the rendered page's first occurrence of `fit-outpost init`.                  | [`websites/fit/outpost/index.md`](../../websites/fit/outpost/index.md) carries a subsection that, when rendered, sits above the first line that mentions `fit-outpost init`, names both postures, and describes each in terms of the boundary rule.               |
| SC8         | The landing-page description of `brief+draft` frames draft-side capability as staged-for-review or explicit approval, never as autonomous action. | The rendered `brief+draft` description contains at least one of the exact substrings _"stage for review"_, _"staged for review"_, or _"explicit approval"_, and none of _"sends automatically"_, _"sends on your behalf"_, or _"moves files automatically"_.      |
| SC9         | Migration preserves agent-level disablement.                                                                                                      | Every agent-level `enabled: false` flag present in `~/.fit/outpost/scheduler.json` at the pre-migration point remains `false` at the migration-step exit.                                                                                                         |
| SC10        | Outside the interim window, no enabled agent's skill availability silently shrinks across migration.                                              | For every agent enabled at the pre-migration point, the skill set available at the post-migration point is a superset of its pre-migration set — except that when the recorded posture is `brief`, exactly the design-classified draft-side skills may be absent. |
| SC11        | A fresh `init` defaults the posture to `brief`.                                                                                                   | After `fit-outpost init` on a machine with no prior Outpost state, accepting defaults, `fit-outpost status` reports `posture: brief` per SC6.                                                                                                                     |
| SC12        | The recorded posture changes only via the user-initiated affordances named in §What; no wake alters it.                                           | Across one observation window containing no user-initiated posture affordance, `fit-outpost status` (per SC6) reports an identical posture at the window's start and end.                                                                                         |

## Out of scope

| Item                                                                                                       | Disposition                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sibling user-testing finding #1500 (platform constraint absent from install snippet)                       | Same fix as PR [#1504](https://github.com/forwardimpact/monorepo/pull/1504) (merged 2026-06-08); issue closed 2026-06-08.                                                                                              |
| Sibling user-testing finding #1501 (data residency / BAA on landing page)                                  | Distinct anxiety force; separate spec in flight under the `issue#1501` PM claim. Cross-link from this spec's landing-page section is fine; substance lives in the #1501 spec.                                          |
| Sibling user-testing finding #1502 (`brew install claude` reorder)                                         | Mechanical docs reorder; closed 2026-06-08.                                                                                                                                                                            |
| Per-skill opt-in / opt-out beyond the two named postures.                                                  | Deliberate product bet: a binary distinction makes the trust contract legible at install time; finer granularity is a different forcing concern. Out of scope for this spec.                                           |
| In-product UI for switching posture after one is already recorded (steady-state switching).                | Out of scope. SC5 permits a one-shot recording for posture-less upgraded installs (fresh installs record a posture at `init`, SC11); steady-state switching of a previously-recorded posture is not part of this spec. |
| The reconciliation algorithm for hand-tuned `enabled` flags during migration                               | Algorithm is the design's. SC9 and SC10 name the invariants; the algorithm itself is not spec-level.                                                                                                                   |
| The Anthropic endpoint identity and where the knowledge graph lives (data residency / network destination) | Belongs to spec for issue #1501; this spec does not address data residency.                                                                                                                                            |
| The read-side privacy concern of `sync-*` skills reading user mail and calendar                            | Read-side privacy of synced data is data-residency territory; belongs to spec for issue #1501. This spec's boundary rule is scoped to writes.                                                                          |
| Adding a structured (`--json`) output mode to `fit-outpost status`.                                        | Plain-text observability is sufficient for SC6. Adding `--json` is a separate concern.                                                                                                                                 |

## Affected surfaces

The design and plan choose the mechanisms; this spec names the surfaces
behaviourally and states what each must afford.

| Surface                                                                              | Contract change                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI command surface (entry point and command dispatch)                               | Surfaces SC5's recording affordance; `daemon` and `wake` honour the recorded posture by producing only the artefact class it permits (per SC1 and SC3).                                                                                                         |
| Bundled scheduler template                                                           | Either declares a default posture or is consulted by the install flow to materialise one; the design picks.                                                                                                                                                     |
| Runtime state under `~/.fit/outpost/`                                                | Records the active posture so the scheduler reads it on every wake; the exact file is the design's call. Writes to the record occur only via the user-initiated affordances (SC12).                                                                             |
| Wake path (scheduler and agent invocation)                                           | Honours the recorded posture by gating which skills the woken agents may run.                                                                                                                                                                                   |
| Bundled agent definition templates (materialised into the install at `init`/upgrade) | Under `brief`, materialised agent definitions do not direct draft-side behaviour: prompt directives and skill bindings are consistent with the recorded posture (e.g. a communication agent's standing "drafts replies" directive must be posture-conditional). |
| Outpost landing page                                                                 | Names the two postures and what each enables, in a position SC7 permits (SC7, SC8).                                                                                                                                                                             |

## Notes for the design author

Advisory only. The design is not bound by anything in this section; these are
observations a reviewer may want to know were considered.

- The bundled scheduling primitive in the scheduler template is per-agent
  (`enabled` flag), while the boundary rule above is per-skill. Bridging this is
  a design choice.
- No bundled skill today declares its outbound surface in a structured field of
  `SKILL.md`; the membership classification is a human pass reading each skill's
  prose and consuming agents.
- The SC3 fixture must include inputs that, under the no-posture baseline, would
  cause every draft-side skill to fire — otherwise SC3 is satisfied by a sparse
  fixture that exercises only some of the boundary.
- The migration path (SC1 / SC5 / SC9 / SC10) interacts with users on a
  pre-spec-1640 release who currently have every skill enabled. The persona's
  framing — _"I need to figure out the line before I turn this on, not after"_ —
  argues against silent inheritance.
- Agent behaviour is prompt-directed, so skill gating alone cannot carry SC1/SC3
  — and prompt directives are no harder: bundled agents run with
  `bypassPermissions`, so skill bindings and template prose are both advisory
  controls. The agent definition templates are an enforcement surface in their
  own right (see Affected surfaces), and the design may need a deterministic
  check on the wake path to genuinely carry SC1/SC3.

## References

- Issue [#1503](https://github.com/forwardimpact/monorepo/issues/1503) — source
  feedback (this spec).
- Issue [#1500](https://github.com/forwardimpact/monorepo/issues/1500) —
  sibling: platform constraint (closed; same fix as PR
  [#1504](https://github.com/forwardimpact/monorepo/pull/1504)).
- Issue [#1501](https://github.com/forwardimpact/monorepo/issues/1501) —
  sibling: data residency / BAA (separate spec in flight).
- Issue [#1502](https://github.com/forwardimpact/monorepo/issues/1502) —
  sibling: `brew install claude` reorder (closed).
- [JTBD.md § Empowered Engineers: Be Prepared and Productive](../../JTBD.md#empowered-engineers-be-prepared-and-productive)
  — job definition.
- [products/outpost/package.json](../../products/outpost/package.json) —
  `jobs[0].forces.anxiety` (source of the JTBD.md generated line).
- [websites/fit/outpost/index.md](../../websites/fit/outpost/index.md) — landing
  page (SC7 / SC8 target).
- [products/outpost/config/scheduler.json](../../products/outpost/config/scheduler.json)
  — bundled scheduler default.

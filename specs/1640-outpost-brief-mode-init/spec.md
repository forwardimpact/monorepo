# Spec 1640 — Outpost brief mode separated from draft-on-behalf at init

## Why

**Persona / job.** Empowered Engineers hire Outpost for *Be Prepared and
Productive* ([JTBD.md § Empowered Engineers: Be Prepared and
Productive](../../JTBD.md#empowered-engineers-be-prepared-and-productive)).
The job's declared **anxiety** force, verbatim from the canonical
JTBD doc and the source of truth in
[products/outpost/package.json](../../products/outpost/package.json)
(`jobs[0].forces.anxiety`):

> *"Delegating awareness to a system feels like losing control."*

**Evidence.** Issue [#1503](https://github.com/forwardimpact/monorepo/issues/1503)
recorded the third independent landing-page bounce reason from
`kata-interview run-8` (JTBD switching interview against the Outpost
landing page; Empowered Engineers / Be Prepared and Productive). The
persona's words:

> *"I'm about to delegate the 'what each person owes me / what I owe them'
> awareness layer to a system that drafts replies on my behalf. I need to
> figure out the read-only-brief vs. draft-on-my-behalf line before I turn
> this on, not after. Today I wanted just the brief side."*

The anxiety fires **at the landing page, before `init`** — distinct from the
platform anxiety (issue [#1500](https://github.com/forwardimpact/monorepo/issues/1500),
addressed by PR [#1504](https://github.com/forwardimpact/monorepo/pull/1504),
both closed 2026-06-08) and the data-residency anxiety (issue
[#1501](https://github.com/forwardimpact/monorepo/issues/1501), separate spec
in flight).

**Why this isn't a runtime toggle.** A scheduler-config flag the user discovers
*after* `init` does not address the force: by then the anxiety has either
blocked adoption or been suppressed. The trust contract is evaluated at
install time.

## What

At install time, Outpost offers two named adoption postures and persists the
choice so the scheduler honours it on every subsequent wake.

The two postures are **`brief`** and **`brief+draft`**. These exact strings
are the user-visible identifiers in CLI flags, `fit-outpost status` output,
and the landing-page copy.

### Boundary rule

A bundled skill is **brief-eligible** if and only if **both** of these hold:

1. Every artefact it writes is owned by Outpost — i.e. lands inside the
   knowledge base path passed at `init`, `~/.fit/outpost/`, or
   `~/.cache/fit/outpost/`.
2. It does not produce content authored on behalf of the user that is
   intended for delivery to a third party, regardless of where that
   content is staged. A markdown draft of an email response composed as
   the user, staged locally under the knowledge base, fails this clause.

A bundled skill is **draft-side** if it fails either clause. Examples
illustrating each clause:

- Fails (1): a skill that reorganises files inside the user's Documents tree,
  or writes a PDF to the user's Downloads folder.
- Fails (2): a skill that drafts an email response under the user's name
  for the user to approve and send, even when the draft is staged as a
  local markdown file; or a skill that sends a chat message via browser
  automation against a third-party web app on the user's behalf.

The **brief posture** runs only brief-eligible skills. The
**brief+draft posture** runs every bundled skill — it is the
no-suppression baseline.

The design produces the membership table by applying this rule to each
bundled skill's outbound surface (its `SKILL.md` prose and the agents that
bind it). The table is a design deliverable, not part of this spec.

### Default

The **default posture for a fresh `init` is `brief`**. The trust contract
is opted into, not opted out of.

## Success criteria

Each verifier below is grounded in the boundary rule above. Most can be
applied at spec-review time; SC3 and SC3-fixture are explicitly bound to
the design's membership table, which the design publishes as part of its
deliverable.

| # | Claim | Verifier |
| --- | --- | --- |
| SC1 | After upgrade from a pre-spec-1640 install, no scheduled or user-initiated invocation produces a draft-side artefact until the user has recorded a posture. | The verifier applies the §What boundary rule to artefacts produced (not skills attempted): on a posture-less install, every observed `fit-outpost daemon` cycle and every `fit-outpost wake <agent>` invocation produces only brief-eligible artefacts. SC5 names the permitted recording mechanisms. |
| SC2 | The selected posture persists across daemon restarts. | After a posture is recorded, `fit-outpost status` reports the same posture (per SC6) after a full daemon stop and restart, without any further user input. |
| SC3 | Under **`brief`**, no scheduled wake produces a draft-side artefact. | Across one full scheduler cycle under `brief` against the SC3 fixture, the verifier applies the §What boundary rule to every artefact written during the cycle and asserts that none falls on the draft side of clauses (1) or (2). The cycle log additionally records, for each skill in the design's draft-side membership, that the skill either did not run or was suppressed. |
| SC3-fixture | The SC3 fixture exercises at least one input per bundled skill that the design's membership table classifies as draft-side. | Implementation-time check: the fixture's inputs are enumerated against the design's published membership table. This SC binds the design to publish that table; it does not pre-decide its contents. |
| SC4 | Under **`brief+draft`**, every bundled skill that a pre-spec-1640 install would run on the same fixture also runs. | The verifier compares the set of skills invoked under `brief+draft` to the set invoked by a pre-spec-1640 install (e.g. the baseline at commit `7d9deb6a` `chore(msbridge): bump to v0.1.4` or any merge on `main` immediately before this spec lands) on the same fixture; the two sets are equal. |
| SC5 | The user records a posture during the upgrade path via one of a fixed set of mechanisms. | The implementation supports at least one of: (a) interactive prompt on the first `fit-outpost daemon` or `fit-outpost wake` after upgrade, blocking until the user records a posture; (b) a `fit-outpost` subcommand whose sole effect is to record a posture; (c) re-running `fit-outpost init` against the existing knowledge base. The chosen mechanism is documented in `fit-outpost --help` output so a user on 3.1.4 can discover it without docs spelunking. |
| SC6 | The active posture is observable via `fit-outpost status` as one of the two committed strings, once recorded. | After a posture has been recorded, `fit-outpost status` plain-text output includes a line matching `^posture: (brief\|brief\+draft)$`. Before any posture has been recorded, the line is either absent or reads `posture: unset`. |
| SC7 | The Outpost landing page introduces the two postures by name, before the rendered page's first occurrence of `fit-outpost init`. | [`websites/fit/outpost/index.md`](../../websites/fit/outpost/index.md) carries a subsection that, when rendered, sits above the first line that mentions `fit-outpost init`, names both postures, and describes each in terms of the boundary rule. |
| SC8 | The landing-page copy describes every draft-side skill in terms of either staging-for-review or per-instance approval — and does not imply autonomous action. | The description of `brief+draft` includes the substrings *"stage for review"* or *"explicit approval"* (or close paraphrases) and does not include the substrings *"sends automatically"*, *"sends on your behalf"*, or *"moves files automatically"*. |
| SC9 | The migration does not silently flip the user's existing configuration in either direction. | Two invariants hold across migration: (i) every agent-level `enabled: false` flag present in `~/.fit/outpost/scheduler.json` immediately before migration remains `false` immediately after; (ii) no agent that was enabled and would run skill *S* immediately before migration runs a strictly smaller set than {*S*} immediately after migration, except as a direct consequence of a posture the user explicitly recorded under SC5. |

## Out of scope

| Item | Disposition |
| --- | --- |
| Sibling user-testing finding #1500 (platform constraint absent from install snippet) | Same fix as PR [#1504](https://github.com/forwardimpact/monorepo/pull/1504) (merged 2026-06-08); issue closed 2026-06-08. |
| Sibling user-testing finding #1501 (data residency / BAA on landing page) | Distinct anxiety force; separate spec in flight under the `issue#1501` PM claim. Cross-link from this spec's landing-page section is fine; substance lives in the #1501 spec. |
| Sibling user-testing finding #1502 (`brew install claude` reorder) | Mechanical docs reorder; closed 2026-06-08. |
| Per-skill opt-in / opt-out beyond the two named postures. | Deliberate product bet: a binary distinction makes the trust contract legible at install time; finer granularity is a different forcing concern. Out of scope for this spec. |
| In-product UI for switching posture after one is already recorded (steady-state switching). | Out of scope. SC5 permits a one-shot recording during the upgrade or first-install flow; steady-state switching of a previously-recorded posture is not part of this spec. |
| The reconciliation algorithm for hand-tuned `enabled` flags during migration | Algorithm is the design's. SC9 names the invariant; the algorithm itself is not spec-level. |
| The Anthropic endpoint identity and where the knowledge graph lives (data residency / network destination) | Belongs to spec for issue #1501; this spec does not address data residency. |
| The read-side privacy concern of `sync-*` skills reading user mail and calendar | Read-side privacy of synced data is data-residency territory; belongs to spec for issue #1501. This spec's boundary rule is scoped to writes. |
| Adding a structured (`--json`) output mode to `fit-outpost status`. | Plain-text observability is sufficient for SC6. Adding `--json` is a separate concern. |

## Affected surfaces

The design and plan choose the mechanisms; this spec only names the
surfaces and what they must afford.

| Surface | Contract change |
| --- | --- |
| `fit-outpost` CLI definition and dispatch (entry `products/outpost/bin/fit-outpost.js`, dispatch `products/outpost/src/outpost.js`) | Surfaces posture recording via SC5's chosen mechanism; `daemon` and `wake` honour the posture by producing only the artefact class permitted (per SC1 and SC3). |
| Bundled scheduler template (`products/outpost/config/scheduler.json`) | Either declares a default posture or is consulted by the install flow to materialise one; the design picks. |
| Runtime state under `~/.fit/outpost/` | Records the active posture so the scheduler reads it on every wake. The exact file is the design's call (existing `scheduler.json`, existing `state.json`, or a sibling). |
| Scheduler and agent invocation (`products/outpost/src/scheduler.js`, `products/outpost/src/agent-runner.js`) | Honours the recorded posture by gating which skills the woken agents may run. |
| Outpost landing page (`websites/fit/outpost/index.md`) | Names the two postures and what each enables, in a position SC7 permits. |

## Notes for the design author

Advisory only. The design is not bound by anything in this section; these
are observations a reviewer may want to know were considered.

- The bundled scheduling primitive in `config/scheduler.json` is per-agent
  (`enabled` flag), while the boundary rule above is per-skill. Bridging
  this is a design choice.
- No bundled skill today declares its outbound surface in a structured
  field of `SKILL.md`; the membership classification is a human pass
  reading each skill's prose and consuming agents.
- The SC3 fixture must include inputs that, under the no-posture baseline,
  would cause every draft-side skill to fire — otherwise SC3 is satisfied
  by a sparse fixture that exercises only some of the boundary.
- The migration path (SC1 / SC5 / SC9) interacts with users on 3.1.4 who
  currently have every skill enabled. The persona's framing — *"I need to
  figure out the line before I turn this on, not after"* — argues against
  silent inheritance.

## References

- Issue [#1503](https://github.com/forwardimpact/monorepo/issues/1503) — source feedback (this spec).
- Issue [#1500](https://github.com/forwardimpact/monorepo/issues/1500) — sibling: platform constraint (closed; same fix as PR [#1504](https://github.com/forwardimpact/monorepo/pull/1504)).
- Issue [#1501](https://github.com/forwardimpact/monorepo/issues/1501) — sibling: data residency / BAA (separate spec in flight).
- Issue [#1502](https://github.com/forwardimpact/monorepo/issues/1502) — sibling: `brew install claude` reorder (closed).
- [JTBD.md § Empowered Engineers: Be Prepared and Productive](../../JTBD.md#empowered-engineers-be-prepared-and-productive) — job definition.
- [products/outpost/package.json](../../products/outpost/package.json) — `jobs[0].forces.anxiety` (source of the JTBD.md generated line).
- [websites/fit/outpost/index.md](../../websites/fit/outpost/index.md) — landing page (SC7 / SC8 target).
- [products/outpost/config/scheduler.json](../../products/outpost/config/scheduler.json) — bundled scheduler default.

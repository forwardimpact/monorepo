# Work Definition

`KATA.md` § The PDSA Loop mandates that every Study finding re-enters the loop
as downstream work — nothing is observed without action. This page is the
single home for two questions: *what each work-type **is*** and *how to
**classify** a finding into one*. It owns the noun catalogue and the sorting
rubric; the sibling references own the rest.

- **Routing** — which channel carries each work-type — lives in
  [`coordination-protocol.md`](coordination-protocol.md).
- **Gating** — how phase artifacts enter `main` — lives in
  [`approval-signals.md`](approval-signals.md).
- **Commands** — the `gh` shapes for obstacle/experiment issues — live in
  [`issue-lifecycle.md`](../../skills/kata-session/references/issue-lifecycle.md)
  and the agent profiles (branch names).

## Work-type catalogue

Cross-references only — see the owning reference for routing/gate detail.

| Work-type          | What it is                                                   | Created via          |
| ------------------ | ----------------------------------------------------------- | -------------------- |
| **fix / bug**      | A mechanical, bounded correction with an obvious resolution | Direct git ops       |
| **spec**           | The WHAT/WHY of a structural change                         | `kata-spec`          |
| **design**         | The WHICH/WHERE — an architectural sketch for a spec        | `kata-design`        |
| **plan**           | The HOW/WHEN — executable steps for a design                | `kata-plan`          |
| **implementation** | The diff that executes an approved plan                     | `kata-implement`     |
| **obstacle**       | A measured gap blocking a target condition                  | labeled issue        |
| **experiment**     | The next testable step against an obstacle                  | labeled issue        |
| **Discussion/RFC** | An unsettled cross-cutting question                         | `gh` Discussion      |

Routing per work-type is in [`coordination-protocol.md` § Channel by output
type](coordination-protocol.md#channel-by-output-type); gating is in
[`approval-signals.md`](approval-signals.md).

## Classification tests

### Mechanical vs structural — the primary fork

- **Mechanical (fix)** — the resolution is clear and bounded; it replaces no
  architecture, introduces no component or contract, and crosses no scope
  boundary. → `fix/` branch, direct git ops.
- **Structural (spec)** — it needs a design decision, introduces or changes a
  component or contract, or exceeds the finder's scope. → `spec/` via
  `kata-spec`.
- **Tie-breaker** — if you cannot state the change as a single verifiable diff
  *without* first making a design decision, it is structural.

### Product-aligned vs internal

A second axis, independent of the mechanical-vs-structural fork — a fix or a
spec can be either value.

- **Product-aligned** — changes a product or service surface a JTBD persona
  hires (CLAUDE.md § Products, [JTBD.md](../../../JTBD.md)).
- **Internal** — changes the agent team's own machinery, infrastructure, or
  process.
- **Decision test** — does the change alter a surface a JTBD persona hires? If
  yes, it is product-aligned; if it touches only the team's own machinery,
  infrastructure, or process, it is internal.

The agent opening any work PR — spec PR, issue-sourced fix, or direct fix —
applies the matching `product` / `internal` label.

### Unsettled → Discussion

Open a Discussion/RFC — **before** any dependent fix or spec — when any holds:

- The answer is not yet settled.
- The same question has surfaced for **≥ 2 agents**.
- It changes a **shared artifact** (a metric, routing rule, scope boundary, or
  policy).

A single finding can require multiple channels in parallel — e.g. a CVE that
also raises a policy question is both a `fix/` PR and a Discussion.

### Out of scope → no work

Creates no branch and no issue. Comment and label (`triaged` / `wontfix`) when
the finding came in through an issue; for items drawn from a synthesis corpus,
record the disposition without a comment. Out of scope means: not aligned with
the product vision, a duplicate, unclear, or already addressed.

### Bug vs feature vs documentation — issue intake

- **Bug** — a crash, error, or output that contradicts documented behaviour.
- **Feature / product-aligned** — a missing capability that is
  [product-aligned](#product-aligned-vs-internal) rather than internal.
- **Documentation** — the behaviour is correct, but the docs are unclear,
  missing, or stale.

### Obstacle vs experiment — PDSA

- **Obstacle** — a measured gap between the current and target condition,
  grounded in data or a trace finding, not narrative.
- **Experiment** — the next small step against an obstacle, with its expected
  outcome recorded **before** the run and naming metrics owned by a single
  skill (a prediction cannot span two skills' runs).

## Scope conversion rule

The finder is not the doer. When a finding exceeds the observing agent's scope,
it is written up as a spec (or filed as an issue) — never fixed in place. This
boundary is what makes the work addressable and keeps `fix/` and `spec/`
branches from mixing (`KATA.md` § Agents, § Design Principles).

## See also

- [`coordination-protocol.md`](coordination-protocol.md) — which channel
  carries each work-type, and the decision-question order.
- [`approval-signals.md`](approval-signals.md) — how phase artifacts are gated
  into `main`.
- [`issue-lifecycle.md`](../../skills/kata-session/references/issue-lifecycle.md)
  — the `gh` recipes for obstacle and experiment issues.
- `kata-pattern-synthesis` (corpus mapping) and `kata-session`
  [team-storyboard](../../skills/kata-session/references/team-storyboard.md)
  Q3 routing are **specializations** that build on this rubric.

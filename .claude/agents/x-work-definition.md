# Work Definition

`KATA.md` § The PDSA Loop mandates that every Study finding re-enters the loop
as downstream work. No observation stands without an action. This page is the
single home for two questions: *what each work-type **is*** and *how to
**classify** a finding into one*. It owns the noun catalogue and the
classification rubric. The sibling references own the rest.

- **Routing** — which channel carries each work-type. It lives in
  [`coordination-protocol.md`](x-coordination-protocol.md).
- **Gating** — how phase artifacts enter `main`. It lives in
  [`approval-signals.md`](x-approval-signals.md).
- **Commands** — the concrete shapes for each operation live in
  [`work-trackers.md`](x-work-trackers.md). The obstacle/experiment recipes that
  compose them are in
  [`issue-lifecycle.md`](../../skills/kata-session/references/issue-lifecycle.md)
  and the agent profiles (branch names).

## Work-type catalogue

Cross-references only. See the reference that owns it for routing/gate detail.

Each "Created via" names an [abstract
operation](x-work-trackers.md#abstract-operations) or the skill that drives it.
The operation's concrete shape lives in the
[matrix](x-work-trackers.md#the-matrix).

| Work-type          | What it is                                                   | Created via                       |
| ------------------ | ----------------------------------------------------------- | --------------------------------- |
| **fix / bug**      | A mechanical, bounded correction with an obvious resolution | `open-change`                     |
| **spec**           | The WHAT/WHY of a structural change                         | `kata-spec`                       |
| **design**         | The WHICH/WHERE — an architectural sketch for a spec        | `kata-design`                     |
| **plan**           | The HOW/WHEN — executable steps for a design                | `kata-plan`                       |
| **implementation** | The diff that executes an approved plan                     | `kata-implement`                  |
| **obstacle**       | A measured gap that blocks a target condition               | `create-issue` + `obstacle` label |
| **experiment**     | The next testable step against an obstacle                  | `create-issue` + `experiment` label |
| **Discussion/RFC** | An unsettled cross-cutting question                         | `create-discussion`               |

Routing per work-type is in [`coordination-protocol.md` § Channel by output
type](x-coordination-protocol.md#channel-by-output-type). Gating is in
[`approval-signals.md`](x-approval-signals.md).

## Classification tests

### Mechanical vs structural — the primary fork

- **Mechanical (fix)** — the resolution is clear and bounded. It replaces no
  architecture, introduces no component or contract, and crosses no scope
  boundary. → `fix/` branch through `open-change`.
- **Structural (spec)** — it needs a design decision, introduces or changes a
  component or contract, or exceeds the finder's scope. → `spec/` through
  `kata-spec`.
- **Tie-breaker** — if you cannot state the change as a single verifiable diff
  *without* a design decision first, it is structural.

### Product-aligned vs internal

A second axis, independent of the mechanical-vs-structural fork. A fix or a
spec can be either value. The test is the surface the change lands on, by
MONOREPO.md tree:

- **Product-aligned** — the change is a shipped product or service surface a
  persona hires. That is the `products/` or `services/` trees, or the
  documentation of those surfaces.
- **Internal** — everything else: shared libraries (`libraries/`), agent
  configuration (`.claude/`), CI and automation (`.github/`), build, release,
  and repository tooling.
- **Decision test** — does the change land under `products/` or `services/` (or
  document one of those surfaces)? If yes, it is product-aligned. Otherwise it
  is internal.

The agent that opens any work PR applies the `product` or `internal` label that
matches. This covers a spec PR, an issue-sourced fix, and a direct fix.

### Unsettled → Discussion

Open a Discussion/RFC **before** any dependent fix or spec when any holds:

- The answer is not yet settled.
- The same question surfaced for **≥ 2 agents**.
- It changes a **shared artifact** (a metric, routing rule, scope boundary, or
  policy).

A single finding can require multiple channels in parallel. For example, a CVE
that also raises a policy question is both a `fix/` PR and a Discussion.

### Out of scope → no work

This creates no branch and no issue. Comment and label (`triaged` / `wontfix`)
when the finding came in through an issue. For items drawn from a synthesis
corpus, record the disposition without a comment. Out of scope means: not
aligned with the product vision, a duplicate, unclear, or already addressed.

### Bug vs feature vs documentation — issue intake

- **Bug** — a crash, error, or output that contradicts documented behaviour.
- **Feature / product-aligned** — an absent capability that is
  [product-aligned](#product-aligned-vs-internal) rather than internal.
- **Documentation** — the behaviour is correct, but the docs are unclear,
  absent, or stale.

### Obstacle vs experiment — PDSA

- **Obstacle** — a measured gap between the current and target condition. Data
  or a trace finding grounds it. Narrative does not.
- **Experiment** — the next small step against an obstacle. Record its expected
  outcome **before** the run. Name metrics that a single skill owns (a
  prediction cannot span two skills' runs).

## Scope conversion rule

The finder is not the doer. When a finding exceeds the scope of the agent that
observes it, write it up as a spec, or file it as an issue. Never fix it in
place. This boundary makes the work addressable. It also keeps `fix/` and
`spec/` branches apart (`KATA.md` § Agents, § Design Principles).

## See also

- [`coordination-protocol.md`](x-coordination-protocol.md) — which channel
  carries each work-type, and the decision-question order.
- [`approval-signals.md`](x-approval-signals.md) — how phase artifacts enter
  `main`.
- [`work-trackers.md`](x-work-trackers.md) — the concrete shape for each
  abstract operation, per tracker.
- [`issue-lifecycle.md`](../../skills/kata-session/references/issue-lifecycle.md)
  — the operation recipes for obstacle and experiment issues.
- `kata-synthesize-backlog` (corpus mapping) and `kata-session`
  [team-storyboard](../../skills/kata-session/references/team-storyboard.md)
  Q3 routing are **specializations** that build on this rubric.

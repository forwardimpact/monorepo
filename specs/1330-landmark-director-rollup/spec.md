# Spec 1330: Landmark director-tier rollup — no command answers "is IT engineering, as a whole, improving?"

## Problem

A structured user-testing run of `fit-landmark` was conducted with a
director-tier persona — BioNova IT **Director of Engineering**
(`zeus@bionova.example`, J100 EM, accountable to the CTO for engineering
health across six IT teams / 65 engineers). The persona is the
user-testing interview identity, not a member of the seeded roster.
The session findings are recorded in
issue [#955](https://github.com/forwardimpact/monorepo/issues/955):
the persona cannot ask the question the JTBD names ("is IT engineering,
as a whole, getting better at shipping?") without running the
team-level flow six times and aggregating the output externally.

Three product-side facts compose into the gap:

- The `--manager <email>` filter on the analytical commands of
  `fit-landmark` resolves a team transitively from one root identity:
  scores, evidence rows, and comments are filtered by the resulting
  team-member set. If the chain extended beyond one link, the same
  filter would aggregate at any level of the chain — the resolution
  function is recursive on `manager_email`.
- The seeded BioNova roster carries the six IT team managers
  (`@athena`, `@prometheus`, `@hephaestus`, `@ares`, `@hermes`,
  `@iris`) with `manager_email: null` after synthetic-roster
  generation. No director-tier person sits above them. The
  `manager_email` chain therefore has exactly one link (engineer →
  team manager) and the team-manager rollup is the deepest level
  the existing filter reaches.
- The DSL at `data/synthetic/story.dsl:56-102` declares a
  `department it` block (the IT department containing the six
  teams) with `parent headquarters` semantics, but no analytical
  command surface accepts a department argument and the roster
  the queries read from does not expose `department` as a filter
  axis. Departmental membership is structurally named upstream
  and operationally invisible downstream.

The persona's session produced the CTO-ready six-driver × seven-quarter
rollup via a shell loop and a Python aggregator. That externalised
workaround is not the failure mode the spec must close — the failure
mode is that the JTBD's Big Hire ("Help me demonstrate engineering
progress without making individuals feel surveilled") is reachable only
by abandoning the product at the level where the user actually operates
and re-implementing the rollup in two other tools.

## Persona and job

**Engineering Leaders → Measure Engineering Outcomes**
([JTBD.md:31-56](../../JTBD.md)). The Big Hire reads "Help me demonstrate
engineering progress without making individuals feel surveilled," and the Little
Hire reads "Help me tell whether culture investments are working before the next
budget cycle." Both lines name the same role — the engineering leader who
answers to the CTO on org-level outcomes. The Competes-With set names the
incumbents the product displaces ("sprint velocity; ticket counts; annual
reviews; asking managers 'how's the team doing?'; not measuring"). The Anxiety
line — "Measurement feels like surveillance regardless of intent" — is
materially advantaged by director-tier rollup because aggregation across a
department-sized group abstracts away from individuals; the rollup is the
surface where the JTBD's anxiety mitigation lands at the leader-tier the JTBD
names. The Fired-When line ("metrics get used punitively; or leadership turnover
deprioritizes measurement") constrains one specific shape of rollup surface: any
department-tier output element that could be read as ranking, shaming, or
singling out a team — a "lowest-scoring team" badge, a manager-name leaderboard
— would fire the first clause of the punitive-use condition. Criterion 6 closes
that specific shape. The longitudinal-punitive-use shape (a symmetric trend
display read punitively over time) and the leadership-turnover clause are not
anchored by any criterion in this spec; they live one layer up at the
JTBD-deprecation level rather than in the rollup surface this spec ships.

The persona's own articulation captured during testing
([issue #955](https://github.com/forwardimpact/monorepo/issues/955))
names the same Competes-With pressure on top of the canonical list:

> "The DX-survey vendor's quarterly PDF already does department-level
> rollups out of the box. Landmark's per-engineer/per-team grounding is
> better; the missing rollup is the gap that keeps the vendor in play."

The vendor PDF is not in the canonical Competes-With list — it is a
persona-articulated extension that names a specific incumbent the
persona's organisation already pays for. The Little Hire ("whether
culture investments are working before the next budget cycle") was
reached in the session only via the same external aggregation
workaround as the Big Hire; both Hires share the same root gap and
this spec scopes to the shared gap rather than to either Hire
exclusively.

The Director of Engineering is the canonical leader the JTBD names —
the role that asks the org-level question for the CTO. Today the
team manager (one level down) and the engineer (two levels down) are
both served. The Director is the level the JTBD points to and the
level the product does not reach.

## Strategic position

The product owns one contract here: **the engineering-leader role
named by the JTBD reaches the Big Hire and the Little Hire without
leaving the product**. That contract is held when the question "is
the engineering org I'm accountable for getting better at shipping?"
returns a system-level trend in a single command — not six commands
plus a spreadsheet — and when the analogous culture-investment
question is answerable on the same surface.

Displacement against the canonical Competes-With set calibrates the
verdict shape:

- **Velocity / ticket counts.** Single-number throughput metrics
  collapse the system to a single dimension; the rollup must
  preserve dimensional breakdown (drivers, skills, quarters) at
  department level the way it does at team level. A rollup that
  produces only an aggregated single number reaches parity with
  the incumbent it is meant to displace.
- **Annual reviews.** Annual reviews are individual and
  retrospective; the rollup must be system-level and quarter-
  capable. Criterion 1's "across all six IT teams' members" and
  the trend-over-time orientation of `fit-landmark` already serve
  this displacement.
- **"How's the team doing?" managerial polling.** Manager polling
  surfaces qualitative impressions one team at a time; the
  rollup must be quantitative and cross-team in one view. This
  is the displacement the spec most directly serves.
- **Not measuring.** The fallback the persona drifts toward when
  the rollup workaround becomes too effortful; the
  measurement-cost-to-reach-the-leader-tier criterion is named in
  Criterion 1's single-invocation requirement.

The persona-articulated DX-survey vendor PDF is named in the issue
body as a specific incumbent the persona's organisation already pays
for, and is recorded here as context for the "missing rollup is what
keeps the vendor in play" framing. The spec does not pick a per-feature
parity match against the vendor — doing so would scope the product to
a specific competitor — and the vendor is therefore not a verification
anchor for any success criterion.

Two leverage points are available. They are not mutually exclusive
but they are not interchangeable: the spec must commit to at least
one and not pre-decide which.

- **Substrate-shape leverage** — the seeded BioNova roster gains a
  director-tier person above each department whose team managers
  are chained to that person via `manager_email`. The existing
  `--manager <email>` transitive resolution then answers the
  IT-org-as-a-system question with no code change. Cost:
  director-tier persons land in the people roster, which affects
  headcount displays, snapshot inclusion math, and `org show`
  totals; the spec is silent on whether they are real-roster
  members or roster-adjacent fixtures.
- **Surface-shape leverage** — a department dimension reaches the
  query path either as a new flag on the existing commands or as
  a resolution rule on the existing flag against a
  department-tagged identity. The roster shape does not change;
  the query path gains a second filter axis. Cost: a new
  dimensional resolution path coexists with the existing
  manager-tier resolution and the two paths must agree on
  aggregation semantics.

A hybrid — partial roster extension paired with a partial new
filter axis — is a third design option. The spec characterises it
as either leverage applied to a subset of the gap rather than as a
distinct third leverage: if the design picks substrate-shape for
IT and surface-shape for non-IT departments, both leverages'
costs apply pro-rata. The shape choice is a design decision; the
spec commits to closing the gap, not to which shape closes it.

## Scope

| Surface | Change | What it does |
| --- | --- | --- |
| At least one analytical `fit-landmark` command that today serves the team-manager rollup | accepts an argument or argument value that resolves to the union of two or more teams' members and returns aggregated output across that union | the Director of Engineering persona answers the IT-as-a-system question in a single command invocation against the seeded substrate, without external aggregation |
| Seeded BioNova substrate at `data/synthetic/story.dsl` (and any downstream artefact derived from it that the product reads) | reaches a state in which a director-tier query — by whichever shape the design selects — returns a non-empty aggregated result for the IT department's six teams | the persona's flagship question is operationally answerable on a clean install of the canonical seed; the verification identity is a director-tier persona the design names (`zeus@bionova.example` is the user-testing convention but the seeded identity may differ) |
| Aggregated output of the director-tier query | when projected to a single team's members, produces the same per-row values the existing team-manager rollup produces for that team — preserving driver / skill / quarter dimensional breakdown rather than collapsing to a single throughput number | the Director sees the same shape of output the team manager sees one level up; the dimensional breakdown that displaces single-number incumbents (velocity, ticket counts) is preserved at department level |
| Per-row content of the aggregated output | identifies team-level rollups by stable team identifiers that do not double as individual-engineer identifiers, and never names individual engineers by name, email, or other personal identifier | the anxiety-mitigation property the JTBD names is preserved at department level; the Fired-When punitive-use condition is structurally avoided at the row content layer |
| Help text and discoverability surface for the affected commands | the director-tier query path is named in `--help` for the command(s) the design selected, includes an example invocation that the seeded substrate resolves to a non-empty result, and is reachable from the organisational directory view in the same way the team-manager path already is | a Director who arrives at the product cold can find the director-tier path without reading the spec |

### Out of scope

| Surface | Reason | Escape route |
| --- | --- | --- |
| Picking between substrate-shape leverage and surface-shape leverage | the spec's contract is operational reachability of the Big Hire and Little Hire by a director-tier persona; the leverage point is a design decision bounded by the substrate-roster-shape vs. surface-filter-axis trade-off named in Strategic Position | n/a — design selects |
| Adding a director-tier roster expansion to non-IT departments (manufacturing, commercial, RD) | the spec scopes to closing the gap for the canonical director persona named in issue #955; extending to other departments is a separable change once the shape is in place | follow-on issue once a second director-tier persona is added to user-testing rotation |
| Cross-department aggregation (CTO-level "all engineering across BioNova" rollup) | the JTBD names the engineering-leader role one level below the CTO; CTO-tier rollup is the next layer up and is separable | follow-on spec once director-tier rollup ships and a CTO persona enters user-testing |
| Calibration of the snapshot scoring math or the comments-attached-to-snapshot model | the existing aggregation function is what the team-manager rollup uses today; this spec uses the same aggregation regime at the next level up, but does not revise it | n/a — calibration of the scoring math is downstream of reaching the level |
| Roster-shape changes that affect headcount displays, totals, or organisation directory output, beyond what is required to surface a director-tier identity under substrate-shape leverage | the spec is silent on whether the director-tier addition is one person per department, one person per organisation, or a roster-adjacent fixture; design picks the shape consistent with the substrate-shape leverage, and any downstream display change follows from that pick | n/a — display-level changes are scoped by the design's leverage choice |
| Per-feature parity match against the DX-survey vendor PDF (named in persona articulation) | doing so would scope the product to a specific competitor; the spec calibrates against the canonical Competes-With set and uses the vendor as the persona-named anchor only | n/a |
| Revising the JTBD Big Hire / Little Hire language or the `Engineering Leaders` persona definition | the spec serves the existing JTBD; revising the JTBD is upstream of any product change | follow-on JTBD edit if persona-testing surfaces a definitional gap |

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | On a clean install of the canonical BioNova seed, a single `fit-landmark` command invocation by a director-tier identity returns aggregated output across all six teams of the IT department named at `data/synthetic/story.dsl:56-102` | (a) run `fit-map init` + `fit-terrain build` against the seeded story; (b) read the help text for the command the design selected and execute the example invocation that help text suggests for the director-tier path; (c) confirm the printed output's aggregated row set covers all six IT teams' members (cross-checked against the team roster the same command produces for each team manager) |
| 2 | The aggregated output produced by criterion 1 names no individual engineer, and the team-level identifiers used for rollup rows are not proxies for an individual (no team identifier that is also a person identifier, no single-person team) | (a) inspect the printed output from criterion 1; (b) confirm no row identifies an individual engineer by name, email, or other personal identifier; (c) confirm each team identifier appearing in the rollup is the team's stable identifier (e.g., the team slug from the DSL) and not a manager's name; (d) confirm every team that appears in the rollup has team size ≥ 2 in the seeded substrate |
| 3 | The director-tier query path is discoverable from a single `--help` text without prior knowledge of the spec — the `--help` for the affected command(s) names the flag, argument, or identity convention required, AND contains a verbatim example invocation, AND the example invocation produces a non-empty aggregated result against the seeded substrate whose team identifier set equals the IT department's six teams declared at `data/synthetic/story.dsl:56-102` | (a) run `fit-landmark <command> --help` for each command the design selected; (b) confirm the help text names the director-tier filter mechanism and contains an example invocation marked as such; (c) run the example invocation verbatim and confirm the output's set of team identifiers, as a set, equals exactly the six IT team slugs from the DSL (no manufacturing / commercial / RD team identifiers present, no IT team missing) |
| 4 | A reader of the aggregated output produced by criterion 1 can determine that the result is an aggregation across multiple teams from a discoverable element of the same view — a label, banner, caption, scope field, summary line, or analogous surface that names a tier identity or an aggregated team count of two or more | (a) inspect the printed output from criterion 1; (b) confirm at least one such element is present and names "N ≥ 2" teams or names the tier explicitly; (c) confirm the same element is absent or differently-shaped on the team-manager output for one of those teams, so the reader can distinguish a team-tier output from a director-tier output by inspecting the element |
| 5 | When the director-tier rollup output is restricted to the rows belonging to a single team in its aggregation scope, those rows are equal — as a multiset, on every column the team-manager rollup produces — to the rows the existing `--manager <team-manager-email>` rollup produces for that team. The director-tier output MAY carry additional aggregation-context columns (e.g., a scope or tier-label column); those columns are excluded from the equivalence comparison | (a) capture the director-tier output for the IT department from criterion 1; (b) restrict it to rows whose team identifier — by whichever convention the design names — equals one of the six IT teams; (c) capture the team-manager output for that team's manager via the existing `--manager` filter; (d) confirm the two row sets, restricted to the columns the team-manager rollup produces, are multiset-equal; columns present only in the director-tier output are excluded from the comparison |
| 6 | No surface element introduced by this spec ranks teams against each other or singles out one team — no "lowest-scoring team" label, no team leaderboard, no top-N team list, no per-team delta against a department mean that is shown only for one team. Producing a per-team breakdown row that shows each team's own score symmetrically is NOT prohibited by this criterion (that is the rollup's purpose) | (a) read the design's selected command output and `--help` text; (b) confirm no element of the prohibited kinds appears; (c) confirm any per-team delta surface, if introduced, is shown symmetrically — all teams' deltas visible together, or none |

## Risks

- **Substrate-shape leverage adds synthetic persons to the roster,
  which ripples into headcount and snapshot math.** The seeded
  BioNova roster carries a `people { count 211 }` declaration;
  adding director-tier identities shifts the count, the
  per-discipline distribution, and the per-J distribution
  downstream. Design records the rippling expectations or scopes
  the director-tier identity as roster-adjacent. Criterion 5 pins
  the team-projection equivalence so the spreading change does
  not silently shift team-level outputs.
- **Surface-shape leverage adds a second filter axis on the same
  command set, which risks the new filter and `--manager`
  becoming partially-overlapping semantics.** If both resolve to
  the IT-as-a-whole set, the two paths must agree on output.
  Design states whether the two paths are equivalent, ordered, or
  exclusive; plan covers the test matrix. Criterion 5 anchors
  the equivalence requirement at the team-projection level for
  whichever shape ships.
- **The director-tier identity convention is contestable.**
  "Director of Engineering" is the BioNova persona's title; other
  organisations use "VP Engineering," "Head of Platform," etc. The
  seeded substrate picks one convention and the surface (flag
  name, help-text wording) picks another; the spec does not pick
  either. Criterion 3 pins the substrate-and-surface
  self-consistency requirement: whatever the design names, the
  help text's example must resolve against the seeded substrate.
- **Cross-department CTO-tier rollup is the next layer up and is
  out of scope, but adjacent.** The persona reports to the CTO and
  the CTO asks for the readout. Once director-tier ships, "all
  engineering across BioNova" becomes the next question. Design
  notes whether the leverage choice composes naturally to a
  CTO-tier layer or commits to a director-tier-only path.
- **The substrate change interacts with the discipline coverage
  change shipped in spec 1080.** Spec 1080
  (issue [#985](https://github.com/forwardimpact/monorepo/issues/985),
  merged PR [#1062](https://github.com/forwardimpact/monorepo/pull/1062))
  added data engineering and engineering management disciplines
  to the starter pathway. A director-tier identity at J100 EM
  typically carries the engineering management discipline; design
  confirms the director-tier identity's discipline assignment is
  consistent with the disciplines the starter pathway exposes.
- **Anxiety-mitigation property must hold across all surfaces
  introduced by this spec, not only at the per-row content
  level.** Criterion 2 anchors anti-naming at the row content
  layer; criterion 6 anchors the anti-ranking property at the
  surface layer. A leaderboard or "lowest-scoring team" label
  would satisfy criterion 2 (no individual names) while violating
  the JTBD's Fired-When line. The two criteria together close
  the surface; design enumerates the surfaces it touches and
  confirms criterion 6 applies to each.

## References

- Issue [#955](https://github.com/forwardimpact/monorepo/issues/955) —
  user-testing report from the Director-of-Engineering persona
  session, including the persona's own articulation of the gap and
  the two suggested shapes (manager-chain vs. department-flag).
- `products/landmark/src/commands/health.js:62, 132-147, 241` —
  existing team-manager filter path; resolves the team via the
  org-query layer and propagates the resolved set to scores,
  evidence, and comments.
- `products/map/src/activity/queries/org.js:23-36` — org-query
  layer entry point; the underlying recursive resolution lives in
  the SQL function it invokes (transitive on `manager_email`).
- `data/synthetic/story.dsl:56-102` — DSL block declaring the IT
  department's six teams; managers `@athena`, `@prometheus`,
  `@hephaestus`, `@ares`, `@hermes`, `@iris`. No director-tier
  identity declared above them. The roster generator that consumes
  the DSL is responsible for the `manager_email: null` state on
  team managers; design notes where the null is decided.
- [JTBD.md:31-56 § Engineering Leaders: Measure Engineering Outcomes](../../JTBD.md)
  — Big Hire / Little Hire / Anxiety / Competes-With / Fired-When
  lines anchoring the persona, the displaced incumbents, and the
  punitive-use constraint criterion 6 closes.
- Issue [#921](https://github.com/forwardimpact/monorepo/issues/921) →
  spec 0950 — auth-wall workaround the persona used to reach the
  analytical commands; sibling issue from the same testing
  rotation.
- Spec 1080 → issue
  [#985](https://github.com/forwardimpact/monorepo/issues/985) —
  starter pathway discipline coverage; adjacent change that
  shapes director-tier discipline assignment.

— Product Manager 🌱

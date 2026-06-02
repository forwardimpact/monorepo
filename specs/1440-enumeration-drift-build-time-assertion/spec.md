# Spec 1440 — Build-time enumeration-drift assertion

## Persona and job

Hired by **Teams Using Agents** to keep the monorepo's documentation
tree honest about its own contents, so the autonomous review cycle
that consumes it (`kata-documentation` and adjacent agent reads) does
not spend its weekly review-day budget repairing one-line drifts on
hand-restated lists. The same gate serves any human reader who
relies on those lists to navigate the repo, but agents are the
primary tenant of the metric series this spec moves.

Related JTBD: *Teams Using Agents — Run a Continuously Improving
Agent Team* ([JTBD.md](../../JTBD.md)).

## Problem

Documentation across `websites/fit/docs/`, `CONTRIBUTING.md`,
`CLAUDE.md`, and `KATA.md` restates on-disk enumerations by hand —
services lists, library counts, sibling composite-action tables,
skill catalogs, products trees, kata workflow lists. When the
underlying file set grows or shrinks, the hand-written restatements
drift independently. There is no build-time check that the
restatements still match the source of truth they paraphrase.

### Recurrence in numbers

The `wiki/metrics/kata-documentation/2026.csv` ledger captured nine
enumeration-class findings in the 14 days from 2026-05-19 to
2026-06-02. Each cycle produced a one-line PR; together they consumed
nine review slots budgeted for deeper recurrence-pass work:

| Date | Cycle / PR | Drift |
|---|---|---|
| 2026-05-19 | cycle 65 PR #1015 | `gear/index.md` service count (35) |
| 2026-05-25 | cycle 69 PR #1193 | `gear/index.md` service count rebaseline |
| 2026-05-28 | (Issue #1260, Security Engineer) | Spec 1310 sibling enumeration missed `fit-wiki` |
| 2026-05-29 | cycle 73 PR #1278 | Bridge-services storage-path enumeration |
| 2026-05-31 | cycle 75 PR #1301 | `gear/index.md` service count 9 → 12 |
| 2026-05-31 | cycle 76 PR #1312 | `CLAUDE.md` composite-actions 4 → 5; `KATA.md` Four → Five; `CONTRIBUTING.md` services tree 6 → 12; products tree added `kata/` |
| 2026-06-01 | cycle 78 PR #1322 | `kata.team` skill count `Fifteen` → `Sixteen` |
| 2026-06-01 | cycle 79 PR #1337 | `CONTRIBUTING.md` services tree 12 → 14 + `gear/index.md` 39/14 cross-page |
| 2026-06-02 | cycle 80 PR #1349 | `getting-started/contributors/index.md` services tree 11 → 14 |

The services-tree topic alone drifted on four different consumer
paths in 13 days, each time with the same fix shape: a one-line
correction to a hand-restated list.

Cycle 77 (PR #1318, `SERVICE_EMBEDDING_URL` default `3011` → `3012`)
sits adjacent but is excluded from this count — it is a
single-source single-sink scalar drift, a different topology with a
much lower recurrence cadence; see § Excluded.

The `errors_found` series for `kata-documentation` stands at n=75,
status `signals_present` (Wheeler/Vacanti XmR), μ=2.1, σ̂=2.38. Of
the eight non-zero cycles in W22–W23, five were enumeration-class.
The status cannot exit `signals_present` while enumeration-class
findings keep arriving on weekly cadence, because the manual
recurrence-pass has no structural surface to attach to.

### Why the manual pass is insufficient

Each consumer's enumeration is hand-restated against memory of the
on-disk state at the time of writing. A new service, library, skill,
or composite action lands in one place but is restated in N consumer
locations, and each consumer drifts independently. The same root
cause surfaced three times in 13 days on the sibling composite-action
enumeration:

| Date | Author | Artifact | Missed entry |
|---|---|---|---|
| 2026-05-25 | Staff Engineer | RFC #1022 / spec 1310 enumeration | `fit-bootstrap` |
| 2026-05-28 | Security Engineer | Issue #1260 | `fit-wiki` |
| 2026-05-31 | Technical Writer | PR #1312 root-doc restatements | `CLAUDE.md` + `KATA.md` consumer rows |

Three sequential fix-authors, each overlooked a different sibling,
because no programmatic check existed.

## Scope

### In scope

- An **enumeration registry** of source-of-truth → known consumer
  paths covering the six topics enumerated below.
- A **build-time assertion** that runs as part of the documentation
  build pipeline, asserts each consumer enumeration matches its
  source-of-truth, and fails the build with an actionable error
  (consumer path, drift summary) on disagreement.
- Coverage of consumers **outside** `websites/fit/docs/`
  (`CONTRIBUTING.md`, `CLAUDE.md`, `KATA.md`, and `websites/kata/`)
  under the same gate, not a separate process. Which build step the
  assertion attaches to is a design choice; the spec requires only
  that one named step exists and that every registry-covered
  consumer flows through it.

### Excluded

- **Scalar value drift** (default ports, model identifiers,
  thresholds, cron schedules). Cycle 77's `SERVICE_EMBEDDING_URL`
  drift is the canonical example; single-source single-sink
  corrections have a different topology and a much lower recurrence
  cadence.
- **Narrative or structural rewrites.** The exclusion line is:
  enumeration-class restatements are *bracketed list-shaped blocks*
  (Markdown bullet lists, tables, ASCII trees, sentences of the form
  "the N <items> are: A, B, C") whose contents are derivable from an
  on-disk set; everything else is prose. Rewrites such as the
  `dispatch-from-chat` flow rewrite or the `bridge-channels`
  `DiscussionContextStore` rewrite are deferred to separate specs
  even when they touch a registered consumer page.
- **Automatic registry updates.** Adding a 7th topic happens through
  a content edit to one file; it is not auto-derived. The spec is
  about asserting consumers match source, not about discovering
  which enumerations exist.
- **Sibling-internal references** (e.g., `forwardimpact/kata-agent`
  internally referencing `forwardimpact/fit-bootstrap`). Same
  exclusion as spec 1310; out of repo.
- **Out-of-repo consumers** (e.g., sibling-action READMEs, the
  public `kata.team` site once built). The registry covers only
  paths that live inside `forwardimpact/monorepo`.
- **Behaviour when a source-of-truth grows without a consumer
  update.** The gate fails the build at the next time the
  documentation-build step runs; whether that is on the
  source-of-truth-changing PR, on a later docs PR, or on both is a
  design decision, not a spec decision.
- **Retroactive history.** The spec does not require backfilling
  passing-state for past PRs; the gate activates at merge of the
  implementation and applies to subsequent doc-touching PRs.

## Enumeration Registry

Six topics make up the initial registry. Each names an authoritative
source path (or section), the consumer paths that restate it today,
and the recurrence-history pointer that motivated inclusion.

Counts cited here are illustrative orientation as of 2026-06-02. The
gate's job is to make the consumer's count match HEAD at every
subsequent commit, so this spec deliberately does not name the
canonical count value — only the source-of-truth path the count
comes from.

| # | Topic | Authoritative source | Known consumer paths | Recurrence (CSV row, PR / issue) |
|---|---|---|---|---|
| 1 | Services tree | Directories under `services/` containing a `package.json` | `CONTRIBUTING.md` § Per-package layout · `websites/fit/docs/getting-started/contributors/index.md` · `websites/fit/gear/index.md` · `KATA.md` | 2026-05-31 PR #1301 · 2026-05-31 PR #1312 · 2026-06-01 PR #1337 · 2026-06-02 PR #1349 |
| 2 | Libraries list | Directories under `libraries/` matching `lib*` containing a `package.json` | `websites/fit/gear/index.md` ("N libraries") · `CONTRIBUTING.md` § Per-package layout | 2026-05-19 PR #1015 · 2026-05-31 PR #1301 (rebaseline) |
| 3 | Sibling composite actions | The sibling rows of `.github/CLAUDE.md` § Third-party actions (rows whose `Action` column begins with `forwardimpact/`) | `CLAUDE.md` § Distribution Model · `KATA.md` § agent composite list | 2026-05-25 RFC #1022 (Staff Engineer + `fit-bootstrap`) · 2026-05-28 Issue #1260 (Security Engineer + `fit-wiki`) · 2026-05-31 PR #1312 (root-docs 4 → 5) |
| 4 | Published skills catalog | The union of `.claude/skills/kata-*/SKILL.md` and `.claude/skills/fit-*/SKILL.md` directories | `KATA.md` (kata-skill count) · `websites/kata/index.md` (kata-skill count; in-repo source for the rendered `kata.team` site) | 2026-06-01 PR #1322 (`websites/kata/index.md` `Fifteen` → `Sixteen`) |
| 5 | Products tree | Directories under `products/` excluding `README.md` and `CLAUDE.md` | `CONTRIBUTING.md` § Per-package layout · `KATA.md` § Primary Products · `websites/fit/docs/products/index.md` | 2026-05-31 PR #1312 (CONTRIBUTING.md products tree added `kata/`) |
| 6 | Kata workflow files | Files matching `.github/workflows/kata-*.yml` | `websites/fit/docs/internals/kata/index.md` § workflow count · `KATA.md` § Workflows | 2026-05-31 PR #1318 deferred finding §(a) — `websites/fit/docs/internals/kata/index.md` "four workflows" framing vs. 5 `kata-*.yml` on disk |

Each consumer registers per-property: count, exhaustive list, or
both. The design names each consumer's committed property so the
gate knows whether to assert counts, sets, or both.

## Assertion-Rule Sketch

For each registry topic, one checkable property identifies what the
gate asserts. The property is the WHAT. The implementation lens
column gives a single illustrative candidate; alternative
implementations satisfying the property are out-of-scope for the
spec to enumerate but in-scope for the design to choose between.

| # | Topic | Property the gate asserts | Implementation lens (illustrative) |
|---|---|---|---|
| 1 | Services tree | The services-tree block in each registered consumer enumerates exactly the set of `services/<name>` directories with a `package.json` | A check at documentation-build time that reads `services/` and the consumer's services-tree block and fails on set difference |
| 2 | Libraries list | Each registered consumer's libraries claim — a count, a list, or both — equals the count or set of `libraries/lib*` directories with a `package.json` | A check that reads `libraries/` and the consumer's claim |
| 3 | Sibling composite actions | The composite-action enumeration in each registered consumer equals the set of rows in `.github/CLAUDE.md` § Third-party actions | A check that reads the canonical section and the consumer's enumeration |
| 4 | Published skills catalog | Each registered consumer's claim — count, exhaustive list, or both — equals the corresponding view of `.claude/skills/kata-*/SKILL.md` ∪ `.claude/skills/fit-*/SKILL.md` | A check that reads `.claude/skills/` and the consumer's claim |
| 5 | Products tree | The products-tree block in each registered consumer enumerates exactly the set of `products/<name>` directories | A check that reads `products/` and the consumer's products-tree block |
| 6 | Kata workflow files | Each registered consumer's claim about the kata workflow set — count, list, or both — equals the set of `.github/workflows/kata-*.yml` files | A check that reads `.github/workflows/` and the consumer's claim |

Whether the gate ships inside `fit-doc`, inside `libdoc`, or as a
peer build step is a design choice — the spec requires only that
one named build step covers every registered consumer.

## Success criteria (landing gate)

| Claim | Verifies via |
|---|---|
| A single named build step asserts every registry-covered consumer against its source-of-truth | The implementation PR description names one build invocation; running that invocation on a branch with synthetic drift introduced on any registry-covered consumer exits non-zero |
| The build step covers consumers outside `websites/fit/docs/` | The build step fails when synthetic drift is introduced into `CONTRIBUTING.md`, `CLAUDE.md`, `KATA.md`, or `websites/kata/index.md` — not just into pages inside `websites/fit/docs/` |
| Each registry entry has at least one consumer wired into the gate | Removing or corrupting any single registered consumer's enumeration block causes the gate to fail; the failure message identifies that consumer by path |
| Failure messages are actionable | On a drift, the gate emits a message containing the consumer path, the topic name, and the symmetric difference between consumer and source (entries the consumer is missing; entries the consumer carries that the source does not), so the author can correct the consumer in one edit |
| The registry is single-source — adding a 7th topic is a one-file edit | The implementation places the registry in a single file whose path the design names; adding a new topic edits exactly that file with no parallel edits elsewhere |
| Existing consumers pass at landing | The gate is green on the implementation PR against `main` HEAD — i.e., landing the implementation does not flag any pre-existing consumer |
| The outcome-metric baseline is recorded at landing | The implementation PR's description records the spec id (1440), the merge SHA, and the merge date, so § Outcome metric evaluates against an explicit baseline rather than an inferred one |
| Implementation PR diff is scoped by the design's plan of record | The PR diff touches only the file set the design's plan of record declares (recorded in the PR description as a path list), plus the spec/design/plan tree under `specs/1440-…/` |

## Outcome metric (post-landing, not a landing gate)

The motivating outcome is a measurable drop in enumeration-class
finds. This is tracked separately from the landing gate because it
matures over the 30 days following merge, not at merge time:

- **Definition.** A finding is enumeration-class for this spec if
  its `note` field on a `wiki/metrics/kata-documentation/2026.csv`
  row, filed after the implementation merge date, describes a drift
  whose topic appears in this spec's Enumeration Registry.
- **Target.** Zero enumeration-class findings in the 30 days after
  merge.
- **Verdict mechanics.** Evaluated at the 30-day window close. A
  missed-by-the-gate drift is distinguished from no-drift-occurred
  by the gate's own green-on-main signal: if the gate stayed green
  through a period that later turns out to have contained a drift
  (i.e. a consumer not yet registered in the registry), that is a
  registry-coverage gap, not a gate bug; the spec records the gap
  and amends the registry rather than rolling back. If the gate
  went red and a drift slipped through anyway, that is a gate bug;
  the implementation owner addresses it.

This section's claims are tracked, not gated. Failing to hit zero
does not roll back the implementation; it informs the
recurrence-pass discipline and any registry-coverage amendment.

— Technical Writer 📝

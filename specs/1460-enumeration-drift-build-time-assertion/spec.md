# Spec 1460 — Build-time enumeration-drift assertion

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

The `wiki/metrics/kata-documentation/2026.csv` ledger captured eight
enumeration-class PR findings in the 14 days from 2026-05-19 to
2026-06-02, plus one Security Engineer issue surface (#1260). Each PR
cycle produced a one-line fix; together they consumed eight review
slots budgeted for deeper recurrence-pass work:

| Date | Cycle / PR | Drift |
|---|---|---|
| 2026-05-19 | cycle 65 PR #1015 | `websites/fit/about/index.md` products enumeration missing Summit (5 of 6) |
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

The `errors_found` series for `kata-documentation` stands at n=78 (as
of 2026-06-04), status `signals_present` (Wheeler/Vacanti XmR). Of
the eight enumeration-class PR findings above, five fall in W22–W23.
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
- **Source-side-only edits** (PRs that change a source of truth but
  touch no registered consumer file). Consumer-side detection is in
  scope: the documentation-build step must run on every PR that
  touches a registered consumer path, so consumer-side edits cannot
  escape detection. Whether the step also runs on source-side-only
  PRs — catching the drift on the source PR itself rather than on the
  next consumer touch — is a design choice. The gate's drift-detection
  rule (consumer ≠ source) is symmetric; only the PR-trigger
  population is the design's call.
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
| 3 | Sibling composite actions | The sibling rows of `.github/CLAUDE.md` § Third-party actions (rows whose `Action` column begins with `forwardimpact/`) | `CLAUDE.md` § Distribution Model · `KATA.md` § Architecture (external composite-actions paragraph) | 2026-05-25 RFC #1022 (Staff Engineer + `fit-bootstrap`) · 2026-05-28 Issue #1260 (Security Engineer + `fit-wiki`) · 2026-05-31 PR #1312 (root-docs 4 → 5) |
| 4 | Published skills catalog | `.claude/skills/kata-*/SKILL.md` directories (the kata published-skill pack) | `KATA.md` § Skills (kata-skill table) · `websites/kata/index.md` (kata-skill count; in-repo source for the rendered `kata.team` site) | 2026-06-01 PR #1322 (`websites/kata/index.md` `Fifteen` → `Sixteen`) |
| 5 | Products tree | Directories under `products/` excluding `README.md` and `CLAUDE.md` | `CONTRIBUTING.md` § Per-package layout · `KATA.md` § Primary Products · `websites/fit/docs/products/index.md` | 2026-05-31 PR #1312 (CONTRIBUTING.md products tree added `kata/`) |
| 6 | PDSA kata workflow files | `.github/workflows/kata-*.yml` minus `.github/workflows/kata-interview.yml` (the four PDSA workflows: `kata-shift`, `kata-storyboard`, `kata-coaching`, `kata-dispatch`) | `websites/fit/docs/internals/kata/index.md` § workflow count · `KATA.md` § Workflows | 2026-05-31 PR #1318 deferred finding §(a) — `websites/fit/docs/internals/kata/index.md` "four workflows" framing vs. the broader `kata-*.yml` glob on disk |

Each consumer registers per-property: count, exhaustive list, or
both. The design names each consumer's committed property so the
gate knows whether to assert counts, sets, or both.

**Registry decisions worth calling out explicitly:**

- *Topic 4 — published skills source-of-truth scope.* Both registered
  consumers commit to a kata-only view, so the source is
  `.claude/skills/kata-*/SKILL.md` alone. `.claude/skills/fit-*/SKILL.md`
  is published separately as the `fit-skills` pack but no current
  consumer in the registry restates a fit-pack count or list. Skills
  outside the `kata-*` and `fit-*` prefix conventions (currently
  `downstream-skill/`, `ship-it/`, `init/`) are repository utilities
  not part of any published catalog and are excluded by the prefix
  glob.
- *Topic 6 — kata-interview exclusion.* `kata-interview.yml` is a
  `workflow_dispatch`-only research utility for JTBD product testing,
  intentionally separate from the PDSA cycle that the registered
  consumers document. The source-of-truth glob excludes it to match
  consumer intent.

## Assertion-Rule Sketch

For each registry topic, one checkable property identifies what the
gate asserts. The property is the WHAT; the design picks the HOW.

| # | Topic | Property the gate asserts |
|---|---|---|
| 1 | Services tree | The services-tree block in each registered consumer enumerates exactly the set of `services/<name>` directories with a `package.json` |
| 2 | Libraries list | Each registered consumer's libraries claim — a count, a list, or both — equals the count or set of `libraries/lib*` directories with a `package.json` |
| 3 | Sibling composite actions | The composite-action enumeration in each registered consumer equals the set of rows in `.github/CLAUDE.md` § Third-party actions whose `Action` column begins with `forwardimpact/` |
| 4 | Published skills catalog | Each registered consumer's claim — count, exhaustive list, or both — equals the set of `.claude/skills/kata-*/SKILL.md` directories |
| 5 | Products tree | The products-tree block in each registered consumer enumerates exactly the set of `products/<name>` directories |
| 6 | PDSA kata workflow files | Each registered consumer's claim about the kata PDSA workflow set — count, list, or both — equals the set of `.github/workflows/kata-*.yml` files excluding `kata-interview.yml` |

Whether the gate ships inside `fit-doc`, inside `libdoc`, or as a
peer build step is a design choice — the spec requires only that
one named build step covers every registered consumer.

## Success criteria (landing gate)

| Claim | Verifies via |
|---|---|
| A single named build step asserts every registry-covered consumer against its source-of-truth | The implementation PR description names one build invocation; running that invocation on a branch with synthetic drift introduced on any registry-covered consumer exits non-zero |
| The build step covers consumers outside `websites/fit/docs/` | The build step fails when synthetic drift is introduced into `CONTRIBUTING.md`, `CLAUDE.md`, `KATA.md`, or `websites/kata/index.md` — not just into pages inside `websites/fit/docs/` |
| Every known-consumer path in the Enumeration Registry is wired into the gate | For each path in the registry's "Known consumer paths" column, removing or corrupting its enumeration block causes the gate to fail with a message naming that path. Each consumer's enumeration block is identified by a marker convention named in the design (HTML comment, fenced metadata block, or unique section heading) so the synthetic-drift test can target the block deterministically — including for unnamed-section consumers (`websites/fit/gear/index.md`, `websites/kata/index.md`) |
| Failure messages are actionable | On a drift, the gate emits a message containing the consumer path, the topic name, and the drift detail in the consumer's declared shape — for set-shaped consumers (exhaustive lists), the symmetric difference between consumer and source; for count-only consumers, the actual count vs the expected count — so the author can correct the consumer in one edit |
| The registry is single-source | The implementation PR description records the path to the registry file (one path); the file at that path declares all six registry topics; no other file in the implementation diff outside `specs/1460-…/` declares a registry topic. By construction, a follow-up PR adding a 7th topic edits exactly that one file. |
| Existing consumers pass at landing | The gate is green on the implementation PR against `main` HEAD — i.e., landing the implementation does not flag any pre-existing consumer |
| The outcome-metric baseline is recorded at landing | The implementation PR description names the spec id (`1460`). The baseline date is the PR's `mergedAt` timestamp from the GitHub API; the spec does not require a merge SHA in the PR body (the SHA is unknown until merge) |
| Implementation PR diff is bounded by the plan's declared path set | `plan-a.md` declares an `Affected paths` section listing the paths the implementation will touch. The PR description quotes that list verbatim. Verifier runs `git diff --name-only main HEAD -- ':!specs/1460-*'` and confirms the result equals the quoted list |

## Outcome metric (post-landing, not a landing gate)

The motivating outcome is a measurable drop in enumeration-class
finds. This is tracked separately from the landing gate because it
matures over the 30 days following merge, not at merge time:

- **Definition.** A finding is enumeration-class for this spec if
  its `note` field on a `wiki/metrics/kata-documentation/2026.csv`
  row, filed after the implementation merge date, begins with
  `enumeration-drift:<topic-id>:` where `<topic-id>` is one of
  `services-tree`, `libraries-list`, `sibling-composite-actions`,
  `published-skills`, `products-tree`, or `kata-workflows`. The
  `kata-documentation` skill writeback adopts this tagging convention
  at implementation merge; pre-merge findings keep their existing
  free-text notes and are not included in the post-landing series.
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

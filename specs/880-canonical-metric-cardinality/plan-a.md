# Plan 880-a — Canonical-metric cardinality and the class boundary

Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md) · The constitution
surface `KATA.md` § Metrics is amended; one new reference page lands at
`.claude/agents/references/metric-class-guidance.md`.

## Approach

Three sequential edits land the design's three components: create the new
pointer page (`metric-class-guidance.md`); amend `KATA.md` § Metrics cardinality
rule to name both classes, state the membership criterion, hold the
one-per-skill invariant on `process-throughput` only, and link to the new page
in one hop; amend the rationale paragraph immediately following the cardinality
rule so each class name appears ≥1× there. The change is doc-only — no code,
no schema, no canonical-set membership change. The new page sits beside
`coordination-protocol.md` and `memory-protocol.md`; KATA.md gains exactly one
new markdown link. SC1–SC4 are mechanically verifiable from `rg` against the
edited files.

Libraries used: none.

## Pre-flight check

The implementation depends on spec 860's Edit 2a wording (post-Edit-2a
cardinality rule) being live on `main`. Before running the plan, confirm:

```sh
rg -n 'one or more metrics' KATA.md
```

returns ≥1 hit (the Edit 2a sentence). Zero hits means Edit 2a has not
landed — block until it has. Confirmed live as of 2026-05-11 `main`
(`KATA.md:261`); re-verify at implementation time per spec § Sequencing.

## File map

| File | Change | Step |
| --- | --- | --- |
| `.claude/agents/references/metric-class-guidance.md` | **Create** | 1 |
| `KATA.md` | Amend § Metrics cardinality rule (lines 257–266 region) | 2 |
| `KATA.md` | Amend § Metrics rationale paragraph (lines 268–272 region) | 3 |

No file deletions. No edits to `.claude/skills/kata-*/references/metrics.md`,
`coordination-protocol.md`, `wiki/storyboard-*.md`, or any
`wiki/metrics/*.csv` — therefore no redefinition file is required (per
[`coordination-protocol.md` § Detection](../../.claude/agents/references/coordination-protocol.md#detection),
KATA.md § Metrics is not a canonical-11 edge, and the canonical metric set is
unchanged by this plan).

## Step 1 — Create `metric-class-guidance.md`

Create the new pointer page that § Metrics links to in one hop.

**Created:** `.claude/agents/references/metric-class-guidance.md`

Full file body (paste verbatim):

```markdown
# Metric-class guidance

`KATA.md` § Metrics names two metric classes — `process-throughput` and
`system-health`. This page tells future spec/design authors which class a new
metric joins and where its producer lives. The orthogonal surface
[`coordination-protocol.md` § Measurement-system changes](coordination-protocol.md#measurement-system-changes)
governs *redefinitions* of existing metrics; this page governs *placement* of
new metrics.

## Class boundary

| Class                | Counts                                                                              | Producer-skill cardinality        | Producer-selection rule                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `process-throughput` | Units of work the producer skill produced in its own run                            | One per process-skill (unchanged) | Producer = the skill that *is* the process (already the rule today).                                                 |
| `system-health`      | Events about the loop the producer skill observes while producing its own units     | Unconstrained at the producer     | Producer is an existing skill that already reads the relevant GitHub/repo state at no extra cost — see § Placement below. |

## Placement (system-health)

A new `system-health` metric **co-locates with an existing producer** skill
that already reads the relevant state for its existing process-throughput
work; do not create a new skill solely to host a `system-health` metric.
Worked precedent: `kata-release-merge` records `approvals_recorded_per_run`
alongside its existing `prs_merged` work because the skill already reads
`<phase>:approved` label state.

## Cardinality (process-throughput)

Cardinality stays one `process-throughput` metric per process-skill; new
process-skills register one (and only one) `process-throughput` metric in
their `.claude/skills/kata-*/references/metrics.md`.

## See also

- `KATA.md` § Metrics — the constitutional surface that names the two classes.
- [`coordination-protocol.md` § Measurement-system changes](coordination-protocol.md#measurement-system-changes)
  — the orthogonal surface that governs *redefinitions* of existing metrics
  (placement vs redefinition: distinct concerns).
```

**Verify:**

- `test -f .claude/agents/references/metric-class-guidance.md` exits 0.
- `rg -c 'co-locates with an existing producer' .claude/agents/references/metric-class-guidance.md`
  returns exactly 1 (SC3 substring constraint; design § Pointer page shape
  fixes the substring to one occurrence, in the placement-rule sentence).
- `rg -c '^## ' .claude/agents/references/metric-class-guidance.md` returns 4
  (Class boundary, Placement, Cardinality, See also).
- `wc -l .claude/agents/references/metric-class-guidance.md` returns ≤40 (a
  reference page, not an essay).

## Step 2 — Amend `KATA.md` § Metrics cardinality rule

Replace the existing cardinality-rule paragraph (currently `KATA.md` lines
261–266 — the sentence that begins "Each such skill records one or more
metrics, …" through "Pipeline stations and orchestration utilities do not
record.").

**Modified:** `KATA.md`.

**Before** (current text, lines 261–266 region, post-Edit-2a):

> Each such skill records one or more metrics, each a **count of units of
> work the process produced this run** (issues triaged, PRs merged, findings
> filed, approvals recorded, and so on). Multiple metrics from one producer
> land as multiple rows in `wiki/metrics/{skill}/{YYYY}.csv` — one row per
> metric per run. Pipeline stations and orchestration utilities do not
> record.

**After** (replacement text — paste verbatim, including the markdown link):

```markdown
Each such skill records one or more metrics, each a **count of units of work
observed this run**. Metrics fall into two classes: `process-throughput`, the
units of work the producer skill produced in its own run (one per producer
skill — unchanged); and `system-health`, events about the loop the producer
skill observes while producing its own units. A new metric is
`process-throughput` if it counts units of work the producer skill produced in
its own run, and `system-health` if it counts events about the loop that the
producer skill observes while producing its own units; the producer of a new
`system-health` metric co-locates with an existing producer per
[`metric-class-guidance.md`](.claude/agents/references/metric-class-guidance.md).
Multiple metrics from one producer land as multiple rows in
`wiki/metrics/{skill}/{YYYY}.csv` — one row per metric per run. Pipeline
stations and orchestration utilities do not record.
```

**Verify:**

- `rg -n 'process-throughput' KATA.md` returns ≥2 hits (cardinality rule
  introducing the class + rationale paragraph from Step 3).
- `rg -n 'system-health' KATA.md` returns ≥2 hits (same surfaces).
- `rg -n 'A new metric is .process-throughput. if it counts' KATA.md` returns
  exactly 1 hit (the membership-criterion sentence — SC1).
- `rg -n 'metric-class-guidance.md' KATA.md` returns exactly 1 hit (the
  one-hop link — SC3).
- SC2 zero-hit grep — run against the cardinality-rule sentence(s), i.e. the
  paragraph that contains "Each such skill records one or more metrics":

  ```sh
  paragraph=$(awk '/^Each such skill records one or more metrics/,/Pipeline stations and orchestration utilities do not record\./' KATA.md)
  for tok in prs_merged specs_drafted designs_drafted plans_drafted \
             implementations_shipped prs_actioned findings_count \
             issues_triaged releases_cut summary_corrections \
             errors_found issues_created approvals_recorded_per_run; do
    printf '%s\t%s\n' "$tok" "$(printf '%s' "$paragraph" | rg -c "$tok" || echo 0)"
  done
  ```

  Every token's count must be `0` (SC2: criterion is class-aware, not
  name-aware).
- `git diff KATA.md` shows changes only within § Metrics, no leakage into
  adjacent sections.

## Step 3 — Amend `KATA.md` § Metrics rationale paragraph

Replace the rationale paragraph immediately following the cardinality rule
(currently `KATA.md` lines 268–272 — the paragraph that begins "The constraint
is XmR-driven." through "distinguishes a stable process from a special-cause
shift.") so each class-name token appears ≥1× inside it (SC4).

**Modified:** `KATA.md`.

**Before** (current text, lines 268–272 region):

> The constraint is XmR-driven. Backlog counts and ages can be queried any
> time from `gh`, `git`, or `npm audit` — they're stocks and sawtooth
> functions, not process data, and freezing them into CSV adds noise without
> signal. Process throughput is the only shape that, plotted run-over-run,
> distinguishes a stable process from a special-cause shift.

**After** (replacement text — paste verbatim):

```markdown
The constraint is XmR-driven for both classes. Backlog counts and ages can be
queried any time from `gh`, `git`, or `npm audit` — they're stocks and
sawtooth functions, not process data, and freezing them into CSV adds noise
without signal. `process-throughput` rides the producer's natural run cadence;
`system-health` rides the producer's natural read of loop state. Plotted
run-over-run, both classes distinguish a stable process from a special-cause
shift.
```

**Verify:**

- `rg -cn 'process-throughput' KATA.md` returns ≥2 (cardinality rule + this
  paragraph — SC4 requires ≥1 in this paragraph).
- `rg -cn 'system-health' KATA.md` returns ≥2 (same — SC4 requires ≥1 in this
  paragraph).
- Paragraph-scoped SC4 grep (counts class-name tokens inside this paragraph
  only):

  ```sh
  rationale=$(awk '/^The constraint is XmR-driven for both classes\./,/distinguish a stable process from a special-cause shift\./' KATA.md)
  printf '%s' "$rationale" | rg -c 'process-throughput'   # ≥1
  printf '%s' "$rationale" | rg -c 'system-health'        # ≥1
  ```

  Both counts ≥1 — SC4 holds.
- The third paragraph below (the canonical-11 redefinitions paragraph
  beginning "Changes to the canonical-11 set …") is **unchanged** —
  `git diff` shows no edits there.

## Step 4 — Quality gates

From repo root, in order:

```sh
bun run format:fix
bun run check
bun run test
```

The diff is documentation-only across `KATA.md` and one new
`.claude/agents/references/*.md` file; no code, no codegen — `bun run test`
is included for parity with the standard pre-push triad and is expected to
pass unchanged. The push gate is `bun run check` exits 0; PR title carries
the spec id (`plan(880): …` for this plan PR, `feat(880): …` or
`feat(kata): …` for the implementation PR).

**Verify:**

- `bun run check` exits 0.
- `bun run test` exits 0 (no test logic changed).
- `git diff origin/main..HEAD --stat` shows ≤3 files changed
  (`KATA.md`, `.claude/agents/references/metric-class-guidance.md`, and at
  most one auto-format ripple).
- `git ls-tree HEAD .claude/agents/references/metric-class-guidance.md`
  returns a blob hash.

## Risks

1. **Auto-format ripple on KATA.md.** `bun run format:fix` reflows prose
   inside markdown paragraphs; the cardinality-rule and rationale-paragraph
   diffs may include unrelated reflows in adjacent paragraphs. Mitigation:
   inspect `git diff KATA.md` before push and revert lines outside the two
   amended paragraphs.
2. **Membership-criterion sentence rendering.** The criterion sentence inside
   the cardinality rule paragraph is one of two sentences in a single
   paragraph (the rule sentence plus the criterion sentence). SC2's
   verification grep above scopes to the *paragraph* (`awk` block, not a
   single line) so cross-line wrapping does not break the zero-hit check.
   Reviewers may prefer the criterion split into its own paragraph; the
   single-paragraph shape is the minimum delta that keeps the rule and its
   criterion adjacent on the page.
3. **Class-name styling consistency.** The pointer page (Step 1) and KATA.md
   (Steps 2–3) both use code-tick formatting for `process-throughput` and
   `system-health` to mark them as schema tokens rather than prose. If any
   future audit grep expects unticked class names, both surfaces share one
   convention. The class names are not metric names (they do not appear in
   any `references/metrics.md` row), so SC2's zero-hit grep across the 13
   canonical tokens is unaffected.
4. **No redefinition file required, but reviewers may ask.** Per
   [`coordination-protocol.md` § Detection](../../.claude/agents/references/coordination-protocol.md#detection),
   the canonical-11 edges are `wiki/storyboard-*.md`,
   `.claude/skills/*/references/metrics.md`, and
   `coordination-protocol.md` § Measurement-system changes — KATA.md
   § Metrics is **not** in that set, and the canonical metric set is
   unchanged. The implementer should call this out in the implementation PR
   body to pre-empt a no-silent-redefinition challenge.
5. **Pre-flight Edit-2a regression.** If a later commit on `main` reverts
   spec 860's Edit 2a wording before this plan runs (`rg -n 'one or more
   metrics' KATA.md` returns 0), Step 2's "Before" text no longer matches.
   The implementer must re-read the current § Metrics text and adapt the
   replacement to fit (the design's three-component shape is unchanged; only
   the textual anchor for replacement shifts).

## Execution recommendation

Single staff-engineer executor, sequential. Steps 1–3 must run in order:
Step 2's link target is the file Step 1 creates; Step 3's `rg` verification
references the cardinality-rule paragraph Step 2 lands. Step 4 closes. No
parallelism; no decomposition into parts (4 steps, 3 files, ≤40 lines of new
prose plus two paragraph swaps in KATA.md fit one PR). Route to the
engineering agent — every edit is a doc change with mechanical verification,
no audience-tuning that warrants `technical-writer`.

— Staff Engineer 🛠️

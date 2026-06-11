# Spec 1800 — Codify a zero-package-surface early exit in kata-release-cut

## Persona and job

Hired by **Teams Using Agents** so the post-merge release-cut assessment —
the Study/verify step that runs after every merge — costs what the merge
shape warrants, instead of paying the full per-package sweep on every
docs-only merge.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

The `kata-release-cut` skill's *Enumerate Changed Packages* step mandates a
per-package latest-tag comparison over every publishable package,
unconditionally. A cheap range check (changed paths since the last cut)
exists and runs first in practice — but the skill gives it **no verdict
authority**: nothing in the procedure says "range since last cut touches
zero publishable paths ⇒ NO CUT OWED, sweep not required." A careful agent
therefore runs the full sweep anyway, because only the sweep is defensible
under the current skill text. The obstacle is the missing codified
discriminator, not agent judgment
([Issue #1623](https://github.com/forwardimpact/monorepo/issues/1623)).

### Evidence

| Fact | Source |
| --- | --- |
| Zero-surface assessment costs $5.99 / 2,524,055 cache-read tokens / 28,095 output tokens / ~8m32s wall / 34 Bash calls | dispatch run 27329648271 (run-352, PR #1620: 4 files, all docs, zero npm surface) |
| Recurrence: runs 303, 323, 333, 352 are zero-package-surface full sweeps; run-354 is a fifth zero-surface assessment that re-checked a range its own record notes was already covered by run-352. Run-303's range carried new unreleased package commits, so the early exit would correctly not have fired there — the avoidable class is 4 of the 5 | `wiki/metrics/kata-release-cut/2026.csv`; Issue #1623 coach triage |
| Docs/wiki/skill merges dominate current merge traffic — zero-surface is the *modal* assessment shape | Issue #1623, coach-ratified |
| Instruction-ordering is unenforceable: running the discriminator as a shadow rider with an explicit "before Step 2" instruction produced a 2-of-4 ordering-inversion rate under live conditions (run-360: shadow bash#14 vs sweep bash#8; run-365: shadow bash#22 vs sweep bash#12) | [Exp #1625 pre-read adjudication](https://github.com/forwardimpact/monorepo/issues/1625#issuecomment-4678801690), coach trace-verified |
| Anchor drift: a racing lane's landed cut moved "range since last cut" between classification and row-landing — run-358's landed row read 7/27 but its stated range reproduces as 6/26 | [Exp #1625 measurement-discipline note](https://github.com/forwardimpact/monorepo/issues/1625#issuecomment-4678440452) |
| Directory membership over-approximates publishability at the file level: `libraries/libbridge/CLAUDE.md` classifies publishable under a directory-only rule yet is matched by neither libbridge's `files` allowlist (`["src/**/*.js", "README.md"]`) nor npm's always-included set — the published tarball is byte-identical (false `SWEEP-REQUIRED`; safe direction, FN 0). Frequency (full-history, classifier spot-verified against `npm pack --dry-run`): 10 of 608 first-parent landings on main over 4 weeks (~1.6% of traffic; ~3.5% of landings touching a publishable package dir), bursty — 9 of 10 in one doc-cleanup week. Forgone savings ≈ $2–3/week steady state, ~$54–72/week in campaign bursts. Concentration: CLAUDE.md 5/10, test files 2/10, macOS packaging metadata 3/10; the shape occurs only in packages with tight `files` allowlists; 4 of 10 were direct-to-main pushes, so only the assessment-time classifier sees the whole population | [Exp #1625 run-392 report](https://github.com/forwardimpact/monorepo/issues/1625#issuecomment-4685328504), coach-verified admissible ([adjudication](https://github.com/forwardimpact/monorepo/issues/1625#issuecomment-4685372875)); RE full-history frequency datum |

### The load-bearing counterexample

Run-343b (PR #1615, docs-only: two root markdown files) reached a **1-cut**
verdict: the sweep cleared a *carried* libbridge cut owed from an earlier
merge. A zero-surface **merge** does not imply a zero-cut **assessment** —
any codified early exit that discriminates on the merged PR's diff alone
silently violates the never-accumulate invariant. The discriminator must
assess the full range since the last verified-clean state **plus**
carry-forward obligations.

### Why the range check alone is also insufficient

The sweep's first-release path enumerates an untagged package's **entire
history**, not a range — so a held first-release package (currently:
svcembedding + svctenancy, deliberately held behind spec 1500 and
Discussion #1385) shows owed commits on every sweep regardless of recent
merge activity. A range predicate is structurally blind to this class; the
early exit must carry the first-release backlog as an explicit re-cite, not
assume the range check covers it.

### Why instruction ordering cannot carry the gate

[Exp #1625](https://github.com/forwardimpact/monorepo/issues/1625) ran the
discriminator live as a shadow rider with an explicit "before Step 2"
instruction. The trace-verified precedence map shows the sweep ran first in
2 of 4 live in-protocol rows (Evidence table above): nothing in the
assessment flow enforces a "do X before Y" instruction, because the sweep
is the assessment's natural first move and post-sweep classification is
the easy path. The same window produced the run-358 anchor-drift instance:
under racing lanes, "range since last cut" moves between classification
and row-landing unless the classification is bound to explicit SHAs. Both
findings are requirements of record for § What
([spec inputs of record](https://github.com/forwardimpact/monorepo/issues/1623#issuecomment-4678850408)),
not design preferences.

## What — the early-exit contract

The event-driven post-merge assessment gains a **classification step —
step 1 of the assessment, structurally ordered** (the first assessment
step after the pre-flight checklist): the assessment first evaluates a
**discriminator predicate** and records a classification, and the
per-package sweep runs **only on a `SWEEP-REQUIRED` classification**. When
every condition holds, the classification is **`NO-CUT-OWED`**: the agent
records the verdict and stops — the sweep is not required and skipping it
is the codified, defensible path. When a baseline resolves and validates
but any other condition fails, the classification is `SWEEP-REQUIRED` and
the full sweep runs; there is no judgment call in between. A run that
cannot resolve an unambiguous, valid baseline records no classification at
all — it is **unclassifiable** (no SHA pair exists), records the
unresolvable state it found, and performs the full sweep (§ Authority
boundary). The gate is the step structure itself — the discriminator must
not ship as a shadow rider or a "run the check before the sweep" ordering
instruction, the shape § Why instruction ordering cannot carry the gate
shows is unenforceable. Full-sweep runs are outside the gate and always
sweep (§ Authority boundary).

**The classification binds an explicit SHA pair.** The predicate is
evaluated against `range_from` (the baseline commit `B`) and `range_to`
(`HEAD` captured at classification time), and both SHAs are recorded in
the verdict record for **both** classification outcomes. The verdict is a
claim about the recorded pair, never about whatever `HEAD` is at recording
time (the Evidence table's anchor-drift row).

**A `NO-CUT-OWED` verdict is a four-conjunct claim**: (a) empty publishable
diff over the bound range, (b) valid anchor, (c) standing-set re-cite —
condition 3's full standing set: first-release backlog (currently
svcembedding + svctenancy), held/deferred cuts, and pending
publish-failure retries and verifications, (d) CI green. These are conditions 2, 1, 3, and 4
below; the path check alone is never a verdict.

**Definition — blocked, verifiable-in-run, due.** An obligation is
*blocked* when its record cites an unmet external prerequisite (a spec
approval, a discussion outcome, a human action). It is **verifiable-in-run**
when the assessment itself can resolve it with the invocations the skill
already uses (the canonical member of this class: a pending
publish-workflow verification, resolvable via one `gh run list`) — the
assessment must resolve it before exiting: verified-success clears it,
verified-failure makes it due, and an outcome unresolvable within the run
(a workflow still in progress) is due for the exit decision — it defeats
the early exit but is not chain-breaking: condition 1's establishment rule
governs it, and the next assessment resolves it. Every other obligation is
*due*. A
due obligation defeats the early exit; a blocked one rides as a re-cite —
and a re-cite asserts the blocking prerequisite is still unmet at
assessment time (a lifted hold makes the obligation due).

### Discriminator predicate (all conditions required)

| # | Condition | Why it is load-bearing |
| --- | --- | --- |
| 1 | **Verified-clean baseline.** A prior run record establishes a baseline commit `B` — an ancestor of current `HEAD` — at which an assessment verified zero unreleased commits beyond the obligations that run re-cited as blocked. A baseline is established by a full sweep reaching that state, or by a cutting run's post-cut state once its tags exist at that commit (a pending publish-workflow verification is verifiable-in-run per § Definition — it does not block baseline establishment, and condition 3 resolves it), or by an earlier early-exit verdict chained to one. | Anchors the range to a state the procedure actually verified, not to the merged PR's diff. Defining cleanliness net of blocked re-cites keeps the predicate satisfiable in the steady state the evidence shows — a standing blocked backlog would otherwise make the exit unreachable forever. |
| 2 | **Zero publishable paths in range — two tiers.** The union of paths changed by each commit in the bound range `range_from..range_to` (per-commit semantics, as the sweep's own log comparison uses — not a net diff, which an add-then-revert pair inside the range would fool) is tested in two tiers. **Tier 1 — directory rule:** a path under no publishable-package directory never defeats this condition; the publishable-path set is derived from the workspace manifest (currently `libraries/*`, `products/*`, `services/*`), not hardcoded. **Tier 2 — packlist membership (the run-392 shape), applied only to paths under a publishable-package directory:** such a path is **non-publishable iff** (i) its package is `private: true`, or (ii) it is absent from the packer's own publish list for that package at the frozen `range_to` (canonical instance: `npm pack --dry-run --json --ignore-scripts`; exact invocation and parsing are the design's call within this constraint). The authoritative source is the packer's own publish list — **re-implementing npm inclusion semantics is excluded at the WHAT level**. The test is file-kind-agnostic: `test/**` classifies by the same membership test as markdown; no file-type scoping. Four invariants govern the refinement: (i) **any doubt fails toward `SWEEP-REQUIRED`** — a tool error, unparseable output, or `.npmignore` presence classifies the path publishable, as does each named doubt class: a path no longer present at `range_to` (deleted or renamed in range — its removal can itself change the artifact) and any read the packer cannot resolve; a change within the range to any **pack-manifest-influencing file** — `package.json`, `.npmignore`, or `.gitignore` at any level within the package directory — classifies publishable, generalizing the `files`-manifest self-defeat (`package.json` is in every publish list; ignore files are never packed, yet a nested ignore file inside a directory-form `files` entry changes the tarball while resolving absent from the packer's list — the invariant a dropped path must satisfy is that it cannot **change** the published artifact, not merely that it is not packed); (ii) the refinement's failure mode is **forgone savings only, never a missed cut**; (iii) a package with pack-affecting lifecycle scripts (`prepack`/`prepare`/`prepublishOnly`) is **excluded from the refinement** — all its paths stay publishable (zero such packages in this monorepo today; the published skill is canonical for external consumers, where a prepack build is the one genuine missed-cut channel); (iv) the always-included set (`package.json`, `README*`, `LICENSE*`, …) needs no special-casing — it is in the packer's list by construction. | Sound over-approximation, sharpened by run-392: the claim is no longer "the sweep can find nothing in the range" but "the sweep run at `HEAD` can find nothing **that alters any published artifact**" beyond what the baseline run already found and re-cited — run-392 resolved exactly this way (tarball byte-identical to v0.1.15). What must never silently accumulate is **artifact-affecting** unreleased change; a packlist-excluded path that is not pack-manifest-influencing cannot change any tarball, and the failure direction of every unresolvable read is the sweep, never the exit (the Evidence table's run-392 row: directory membership alone forgoes the exit on the modal contributor-doc shape, at burst cost exactly when the exit pays most). |
| 3 | **Carry-forward state re-cited.** Every standing obligation — first-release backlog, held/deferred cuts, pending publish-failure retries and publish-workflow verifications from prior runs — is either empty, explicitly re-cited as blocked with its blocking reference, or verifiable-in-run and resolved to verified-success (§ Definition). Any due obligation — including a verifiable-in-run obligation that resolves to failure — defeats the early exit. | Covers what the range check structurally cannot see (run-343b's carried cut; the untagged-package class above). |
| 4 | **Main CI green.** The existing pre-flight checklist passed. Re-cited as a conjunct — even though the step sits after pre-flight — so the verdict record is self-contained. | The never-release-from-broken-main rule applies to the verdict, not just to cutting. |

**The refined rule earns its own agreement data.** Condition 2's
membership tier does not inherit the shadow-window agreement rows that
validated the directory-level rule
([Exp #1625](https://github.com/forwardimpact/monorepo/issues/1625)): a
continued or short follow-up shadow window under the same protocol earns
the refined predicate its own agreement data before the early exit fires
on it. This is load-bearing for the unscoped (file-kind-agnostic) form —
if the full sweep would ever CUT on a tarball-identical test-only range,
that surfaces in shadow as an unsafe-direction disagreement, falsified
cheaply rather than in production. Window length and mechanics are the
experiment owners' call.

### Authority boundary

The codified step must state each of the following as a discrete rule, in
run-class vocabulary the skill itself defines:

- **Run classes.** The skill's "When to Use" vocabulary is amended to
  distinguish the **full-sweep run** (the scheduled cadence, and any
  on-demand run asked to sweep) from the **event-driven post-merge
  assessment**; today's text knows only "scheduled weekly" and "on-demand"
  and cannot express the boundary. Amending it is in scope.
- **Who may exit.** Only an event-driven post-merge assessment may
  early-exit. Full-sweep runs always perform the per-package sweep.
- **Unclassifiable ⇒ sweep.** A run that cannot determine its class, or
  cannot resolve an unambiguous baseline, performs the full sweep.
- **Re-anchor bound.** The baseline chain must re-anchor to a real
  per-package sweep — performed by a run of any class — at least once per
  scheduled cadence interval. For consumers
  operating without a scheduled cadence, the skill text states a default
  re-anchor bound (a maximum chain length or age — value is the design's
  call); a chain older than the applicable bound — cadence interval or
  stated default — is unresolvable (⇒ full sweep).
- **What the boundary guarantees.** With the bound in place, a wrong or
  corrupted baseline record survives at most one re-anchor interval: the
  next full sweep re-verifies every tagged package from its tags and every
  untagged package from its history, so unreleased **commits** cannot
  silently accumulate past it. The guarantee covers the commit-accumulation
  class only — pending publish-failure recovery is record-dependent under
  both the sweep and the early exit (a tag-based sweep cannot see a failed
  publish either); this contract does not change that.

### Recording contract

Every assessment verdict — full-sweep and early-exit alike — records, in
the same per-run recording surfaces the skill already mandates, the state
the next run needs to chain:

- A verdict reaching a verified-clean or post-cut state records that commit
  and each carry re-cite with its blocking reference.
- Every discriminator classification — `NO-CUT-OWED` and `SWEEP-REQUIRED`
  alike — records the explicit SHA pair it was evaluated against
  (`range_from` = baseline, `range_to` = `HEAD` at classification time);
  an early-exit verdict additionally records the range-check evidence
  (path summary). An unclassifiable run (§ What) has no classification and
  no SHA pair — it records the unresolvable state it found and sweeps.
- A full-sweep verdict that ends with **due-but-deferred** obligations (a
  deferral shape condition 3 anticipates; a pending verifiable-in-run
  verification is not in this class — § Definition) records that it establishes no
  chainable baseline — the chain is broken, and subsequent assessments
  full-sweep until some run reaches a verified-clean or post-cut state.

Binding sweep verdicts too is what keeps condition 1 resolvable after every
re-anchor; an early-exit-only contract would orphan the chain at exactly
the runs that refresh it. These records live in the existing free-form
recording surfaces — the metrics-schema exclusion below constrains the
design to fit them there rather than adding columns.

### Instruction-budget headroom

The skill file currently sits at 768/1280 words and 172/192 lines of its L5
budget, and spec 1500's implementation (spec in flight as PR #1384) will
land eight hazard codifications on the **same file**
([Issue #1613](https://github.com/forwardimpact/monorepo/issues/1613):
budgets across kata skills are structurally at ceiling, and trim-to-green
repairs conserve the treadmill). The WHAT-level constraints, stated
independently of which implementation lands first:

- The step's normative content (predicate, authority boundary, recording
  contract) lives in the skill file itself — verdict authority must be in
  the canonical procedure, not in a reference.
- After this spec's implementation merges, the skill file is at ≤95% of
  both L5 caps — regardless of whether spec 1500's content has already
  landed. How content is placed or displaced (including displacing
  already-landed content to the `references/` tier) to meet this without
  trimming normative content is the design's call (carry-forward 4).

## Scope

### In scope

- The `kata-release-cut` skill gains the early-exit step defined in § What:
  discriminator predicate, authority boundary, and recording contract.
- The skill's "When to Use" run-class vocabulary is amended per § Authority
  boundary.
- The skill's recording section ("Memory: what to record") changes for
  **all** verdict kinds per § Recording contract, not only early exits.
- A `references/` file for worked detail, if the design needs one under the
  headroom constraints above.
- The skill is published (kata-skills pack) and is the canonical source for
  the release procedure — this is a verdict-authority contract change for
  external consumers as well as for the monorepo's release-engineer
  (precedent: spec 1500, in flight as PR #1384, amends the same
  published skill via this pipeline). The codified text must stand alone for a consumer with no
  access to this monorepo's wiki: the baseline/recording contract is stated
  against the skill's own recording surfaces, not monorepo-specific files.

### Excluded

- **Spec 1500's hazard codification.** Publish-time hazards are a distinct
  concern with its spec in an in-flight PR; this spec is assessment-time
  cost. Whichever implementation lands second rebases over the other's
  skill-file changes. **Residual:** the ≤95% criterion binds only *this*
  spec's implementation PR — if it lands first, spec 1500's only budget
  criterion is `bun run check` (the 100% cap), so its later rebase could
  legally land the combined skill file at 95–100%, eroding the headroom.
  The residual is registered on
  [Issue #1613](https://github.com/forwardimpact/monorepo/issues/1613) so
  the second-landing implementation inherits the ≤95% target as a tracked
  constraint, whichever spec that turns out to be.
- **Tooling.** No new scripts, CLI flags, or CI gates; the predicate runs
  with the git/gh invocations the skill already uses.
- **`kata-release-merge` changes.** The merge gate is a separate procedure.
- **Scheduled-sweep cadence or metrics-schema changes.** The weekly full
  sweep and the per-run CSV format stay as they are; the recording contract
  fits within existing free-form surfaces.
- **Assessment-cost enforcement.** The cost reduction is observed via the
  existing metric home (`wiki/metrics/kata-release-cut/2026.csv` plus
  dispatch traces), not gated.

### Design-phase carry-forwards

1. **Baseline-record shape.** The design picks how condition 1's baseline
   is identified in run records (commit citation format, ancestry check,
   where it lives in the skill's recording surfaces) such that a fresh
   session can resolve it without ambiguity — including how the skill's
   monorepo-flavored recording paths generalize for external consumers —
   and confirms the no-unambiguous-baseline case routes to the full sweep —
   all at a total predicate-resolution cost materially below the sweep it
   replaces: a cheapness bar, not just a correctness bar (an acceptance
   criterion on the designed mechanism; realized run cost stays
   observed-not-gated per § Excluded).
   Shallow-clone degradation is part of this shape: on a shallow checkout
   the baseline may sit below the fetch boundary, so the ancestry check
   fails safe (unresolvable ⇒ full sweep) but the exit then never fires —
   the design must check the dispatch checkout depth and state the
   deepen-or-sweep behaviour.
2. **Publishable-path derivation.** The design picks the exact derivation
   of the path set from the workspace manifest — including at which commit
   the manifest is read (a manifest change within the range must not narrow
   the set) — and how a brand-new package directory appearing in the range
   is caught (it must defeat the early exit via condition 2). The design
   also pins the merge-commit semantics of the union walk: the traversal
   must provably remain a superset of every per-directory log the sweep
   would run — `git log --name-only` and pathspec'd logs diverge under
   TREESAME merge simplification, so the chosen invocation must be shown
   not to prune commits the sweep's path-scoped comparison would count.
   The design additionally picks condition 2's membership-test mechanics
   within the packer-authoritative constraint (§ What): the exact packer
   invocation and JSON parsing of its publish list, the manifest-read
   semantics at the frozen `range_to` (consistent with the
   manifest-change clause above), and how each doubt class (tool error,
   unparseable output, `.npmignore` presence, path absent at `range_to`)
   routes to `SWEEP-REQUIRED`. Cost bound: seconds and ~zero tokens — the
   membership test runs only on paths that already passed the directory
   tier, so the modal zero-surface range (docs/wiki/skills) never invokes
   it — and the read sits under carry-forward 1's cheapness bar.
3. **Step numbering and references.** The step's position is fixed by
   § What; the design keeps existing step numbering and cross-references
   consistent around it.
4. **Content placement under the budget.** The design decides what, if
   anything, moves to the `references/` tier so the post-implementation
   file meets the ≤95% criterion without trimming the new step's normative
   content. Any new `references/` relief-valve file carries its own L6
   budget (128 lines / 768 words) — the displacement math must account for
   that cap, not treat the tier as unbounded.
5. **Default re-anchor bound.** The design picks the default bound value
   for cadence-less consumers, and must not lean on the re-anchor for
   publish-failure recovery (out of the boundary's guarantee class).

## Success criteria

| Claim | Verifies via |
| --- | --- |
| The skill carries an early-exit step with explicit verdict authority. | Reading the skill file alone shows a step stating that when the predicate holds, `NO-CUT-OWED` is the codified verdict and the sweep is not required. |
| The sweep is structurally gated on the classification. | The skill text makes the discriminator step 1 of the event-driven assessment and conditions the per-package sweep on a `SWEEP-REQUIRED` classification (or an unclassifiable outcome); no "run the check before the sweep" ordering instruction carries the gate. |
| Every classification binds an explicit SHA pair. | The skill's recording requirement names `range_from` and `range_to` as recorded fields of every discriminator classification, `NO-CUT-OWED` and `SWEEP-REQUIRED` alike. |
| All four predicate conditions are present and conjunctive. | The skill text states a `NO-CUT-OWED` verdict as a four-conjunct claim — empty publishable diff over the bound range (per-commit union semantics), valid anchor, standing-set re-cite, green CI — and that any failure routes to the full sweep. |
| The run-343b shape routes to the sweep. | The skill text states that a due (unblocked) carry-forward obligation defeats the early exit. |
| The run-392 shape exits, and only on an affirmative read. | The skill text states condition 2's two-tier form with all four invariants: a package-dir path is non-publishable iff its package is `private: true` or it is absent from the packer's own publish list at the frozen `range_to`; any doubt — tool error, unparseable output, `.npmignore` presence, a path absent at `range_to` — classifies publishable (⇒ `SWEEP-REQUIRED`); a change to a pack-manifest-influencing file (`package.json`, `.npmignore`, or `.gitignore` at any level within the package directory) classifies publishable; lifecycle-script packages are excluded from the refinement; npm inclusion semantics are not re-implemented. |
| The first-release backlog survives the early exit. | The skill text requires the first-release backlog re-cite as part of condition 3, independent of the range check. |
| The pending-publish-verification class is deterministic. | The skill text classifies a pending publish-workflow verification as verifiable-in-run: the assessment resolves it before exiting — verified-success clears it, verified-failure or a still-in-progress outcome is due (⇒ full sweep). No reading classifies it blocked or ambiguously due. |
| The authority boundary is self-contained. | The skill text states each § Authority boundary rule — amended run classes, who may exit, unclassifiable ⇒ sweep, the re-anchor bound including the cadence-less default — in its own (amended) run-class vocabulary. |
| The recording contract supports chaining across both verdict kinds. | The skill's recording section requires every assessment verdict to record chainable state per § Recording contract, including the broken-chain rule for due-but-deferred sweeps. |
| The skill respects its instruction budget with headroom. | `bun run check` passes on the implementation PR, and the skill file lands at ≤95% of both L5 caps (≤1216 words, ≤182 lines), regardless of landing order relative to spec 1500's implementation. |
| The implementation diff stays in scope. | The PR diff touches only the `kata-release-cut` skill directory and the spec/design/plan tree under `specs/1800-release-cut-zero-surface-early-exit/`. |
| The cost effect is observable — a trailing indicator, not a merge gate. | The first post-implementation zero-surface assessment at which the predicate holds records an early-exit verdict in the metric home, the first before/after data point against the run-352 baseline. |

— Release Engineer 🚀 (r1; r3 applied per the
[#1623 amendment contract](https://github.com/forwardimpact/monorepo/issues/1623#issuecomment-4685425527))
· Product Manager 🌱 (r2, Exp #1625 requirements of record; r3 contract,
run-392 condition-2 packlist-membership refinement; r4, SE-review H1
fold — pack-manifest-influencing files classify publishable)

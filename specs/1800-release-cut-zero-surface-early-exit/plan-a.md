# Plan 1800 — Zero-surface early-exit in kata-release-cut

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

Add a first assessment step to `.claude/skills/kata-release-cut/SKILL.md`
(between Pre-Flight and Enumerate) carrying the discriminator predicate and
its verdict authority, amend § When to Use with run-class vocabulary, extend
§ Memory with the recording contract for all verdict kinds, and displace the
membership-test mechanics + worked examples to `references/early-exit.md` to
hold SKILL.md at ≤95% of both L5 caps. Renumber the file's literal Step
numbers (Enumerate 2→3 … Summary 7→8). Verdict authority lives in SKILL.md;
only mechanics move to the reference.

Libraries used: none.

## Step 1 — Run-class vocabulary (§ When to Use)

Files modified: SKILL.md § When to Use.

Replace the two-bullet list with three run classes: **full-sweep run**
(scheduled cadence + any on-demand sweep — always sweeps); **event-driven
post-merge assessment** (may early-exit); and the rule that a run which
cannot determine its class performs the full sweep.

Verify: the section names both run classes and the unclassifiable⇒sweep rule.

## Step 2 — Insert the classification step

Files created: none. Files modified: SKILL.md (new step + renumber).

**Insertion point**: after the `### Tag Prefix Mapping` and `### Version
Rules` subsections that sit between Step 1 (Pre-Flight) and Step 2
(Enumerate) — the new classification step becomes the first numbered
*assessment* step and Enumerate renumbers 2→3 (… Summary 7→8). The prefix
mapping / version rules are reference subsections, not assessment steps, so
they stay where they are, ahead of the classification step.

Insert a step stating, in SKILL.md (normative, not the reference):

- The step is the **first assessment step**; the per-package sweep
  (Enumerate onward) runs **only** on `SWEEP-REQUIRED` or unclassifiable.
- A `NO-CUT-OWED` verdict is the **four-conjunct** claim: (1) verified-clean
  baseline `B` (ancestor of `HEAD`); (2) zero publishable paths over
  `B..HEAD` by **per-commit union** (not net diff); (3) standing-set re-cite
  (first-release backlog, held cuts, pending publish verifications resolved);
  (4) main CI green. Any failure ⇒ `SWEEP-REQUIRED`.
- Condition 2 two tiers: directory rule (manifest publishable dirs at
  `range_to`); packlist membership for in-dir paths (non-publishable iff
  `private:true` or absent from the packer's publish list at `range_to`),
  with the four invariants (any doubt ⇒ publishable incl. tool error,
  unparseable output, `.npmignore` present, path absent at `range_to`,
  pack-manifest-influencing file changed; forgone-savings-only failure;
  lifecycle-script packages excluded; always-included set needs no
  special-casing; npm semantics not re-implemented).
- Each classification records the SHA pair (`range_from`=`B`,
  `range_to`=`HEAD` at classification); the verdict is a claim about the pair.

Verify (SC walk): the step states verdict authority; the sweep is gated on the
classification with no ordering instruction; the SHA pair is recorded for both
outcomes; the four conjuncts are present and conjunctive; a due carry defeats
the exit; condition 2's two-tier form with all four invariants is stated; the
first-release backlog re-cite is part of condition 3; a pending publish
verification is verifiable-in-run (resolve before exit; failure/in-progress ⇒
due).

## Step 3 — Authority boundary (§ within the step)

Files modified: SKILL.md.

State, each as a discrete rule in run-class vocabulary: only an event-driven
assessment may exit; full-sweep runs always sweep; unclassifiable⇒sweep
(incl. unresolvable baseline / shallow-clone where `B` is below the fetch
boundary ⇒ deepen-or-sweep, default sweep); the re-anchor bound (re-anchor to
a real per-package sweep once per scheduled cadence interval; cadence-less
default = max chain length 20); and what the bound guarantees
(commit-accumulation only; publish-failure recovery stays record-dependent).

Verify: each boundary rule present in its own (amended) vocabulary.

## Step 4 — Recording contract (§ Memory: What to Record)

Files modified: SKILL.md § Memory.

Require **every** verdict (sweep + early-exit) to record chainable state: the
SHA pair per classification; early-exit additionally records the range path
summary; a verified-clean/post-cut verdict records `B` + each carry re-cite
with its blocking reference; a full-sweep ending due-but-deferred records
that it establishes **no chainable baseline** (chain broken). Stated against
the skill's own recording surfaces (no new CSV columns) so an external
consumer chains without monorepo wiki.

Verify: § Memory requires chainable state for both verdict kinds incl. the
broken-chain rule.

## Step 5 — references/early-exit.md (mechanics + worked detail)

Files created: `.claude/skills/kata-release-cut/references/early-exit.md`.

Hold (≤128 lines / ≤768 words): the packer invocation
(`npm pack --dry-run --json --ignore-scripts`) + JSON parsing + per-doubt-class
routing; the per-commit union-walk invocation
(`git log --no-merges --name-only --format= range_from..range_to`) with the
superset-over-pathspec'd-logs argument (no `--first-parent`); the
baseline-resolution and shallow-clone worked examples. Generic phrasing — no
real package names/SHAs.

Verify: file under L6 cap; SKILL.md references it for mechanics only.

## Step 6 — Renumber + budget hold

Files modified: SKILL.md.

Renumber literal Step headings after Pre-Flight and update cross-references.
Enumerate the cross-references to update: the § Memory and § Edge Cases
mentions and any "Step N" reference in prose; grep `Step [0-9]` to find them.
Run `bun run check`; if lines exceed ≤182, tighten the existing Step
(formerly 2 Enumerate)/Step (formerly 4 Bump) code blocks — which carry
several lines of shell that can fold — to recover headroom; do not trim
normative new content. Budget projection: ~1054 words / ~189 lines before
tightening; the tightening must shed ≥7 lines.

Verify: `bun run check` green; SKILL.md ≤1216 words / ≤182 lines; the
cheapness bar holds (a modal zero-surface range resolves to `NO-CUT-OWED`
without invoking the packer — traced by inspection of the predicate order:
Tier 2 runs only on paths that passed Tier 1).

## Risks

- **Line headroom is tight** (~189 lines projected). Mitigation: Step 6
  tightens existing verbose code blocks; the design fixes the target.
- **Shared file with spec 1500.** Whichever lands second rebases over the
  other (disjoint sections). Mitigation: per Issue #1613 the second-landing
  PR inherits the ≤95% target.
- **Union-walk soundness.** A wrong invocation could prune a commit ⇒ false
  `NO-CUT-OWED` (missed cut). Mitigation: the verification constructs
  add-then-revert and merge-with-side-branch ranges and confirms neither
  yields a false exit.

## Out of implementation scope

The agreement-window mechanics — the refined condition-2 predicate earning
its own shadow agreement data before the early exit *fires* on it (spec
§ "The refined rule earns its own agreement data") — are the experiment
owners' call, not this implementation. This PR codifies the step and its
authority; whether/when a live exit fires on the refined predicate is gated
by that separate shadow window. The implementer does not wire a gating
experiment.

## Execution

Single engineering agent, sequential Steps 1→6 (Step 5's reference holds
mechanics displaced from Steps 2/4, so author it after those sections'
normative text exists; the budget hold in Step 6 needs all sections present).

## Verification

`bun run check` (≤95% L5; reference under L6); the SC walk in Step 2; the
union-walk superset and cheapness checks per design § Verification; diff
touches only the skill dir + `specs/1800-*/`.

— Staff Engineer 🛠️

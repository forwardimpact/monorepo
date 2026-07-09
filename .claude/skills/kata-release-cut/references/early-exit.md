# Early-exit protocol

The normative rules for SKILL.md § Step 2. A `NO-CUT-OWED` verdict requires
all four conditions below; when any condition fails, or any check is in
doubt, the verdict is `SWEEP-REQUIRED`. Worked invocations and traversal
hazards live in [early-exit-mechanics.md](early-exit-mechanics.md).

## Verdicts and authority

- Only an event-driven post-merge assessment may exit early. Full-sweep runs
  always sweep.
- A run that cannot determine its class, or cannot resolve one unambiguous
  valid baseline, records the unresolvable state and sweeps.
- Every classification binds a SHA pair: `range_from` is the baseline `B`,
  `range_to` is `HEAD` at assessment time. The verdict is a claim about that
  pair, never about live `HEAD`.
- The intended failure mode is forgone savings, never a missed cut: doubt
  always classifies toward the sweep.

## Condition 1 — Verified-clean baseline

A commit `B`, cited by a prior run record and an ancestor of `HEAD`, at which
an assessment verified zero unreleased commits beyond what it re-cited as
blocked. A full sweep reaching that state, a post-cut state, or a chained
earlier early-exit each set a valid `B`. On a shallow checkout where `B` sits
below the fetch boundary, deepen until the ancestry check can run; if `B`
still cannot be reached, the baseline is unresolvable and the run sweeps.

## Condition 2 — Zero publishable paths over `B..HEAD`

Test the union of paths changed by each commit in the range (never a net
diff), in two tiers at the frozen `range_to`:

1. **Directory tier.** A path under no publishable-package directory (from
   the workspace manifest, read at `range_to`) never defeats the exit.
2. **Packlist tier**, for in-directory paths only. A path is non-publishable
   only when the package is `private: true` or the path is absent from the
   packer's own publish list. Never re-implement npm inclusion semantics.

Route every doubt to publishable: a tool error, unparseable output, a
present `.npmignore`, a path absent at `range_to`, or any change to a
pack-manifest-influencing file (`package.json`, `.npmignore`, or
`.gitignore` at any level in the package directory). A package that declares
`prepack`, `prepare`, or `prepublishOnly` is excluded from the packlist
refinement — all its paths stay publishable, because a build step is a
genuine missed-cut channel.

## Condition 3 — Standing-set re-cite

Every standing obligation — first-release backlog, held or deferred cuts,
pending publish-failure retries, pending publish-workflow verifications —
must be empty, re-cited as blocked with its reference, or verifiable-in-run
and resolved to verified success. A pending publish-workflow verification is
verifiable-in-run: resolve it before exiting (`gh run list`). Success clears
it; a failure or a still-in-progress run is due, and any due (unblocked)
obligation defeats the exit.

## Condition 4 — Main CI green

The Pre-Flight checklist passed, re-cited in the verdict record so the
record stands alone.

## Re-anchor bound

The early-exit chain must re-anchor to a real per-package sweep (any run
class) at least once per scheduled cadence interval; cadence-less consumers
use a default maximum chain length of 20 early-exits. A chain past the bound
is unresolvable, so the run sweeps. The bound caps drift from commit
accumulation only; publish-failure recovery stays record-dependent (see
[early-exit-mechanics.md](early-exit-mechanics.md) § What the re-anchor
bound guarantees).

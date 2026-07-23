# Plan 2270-a — Benchmark Trace Parity

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Build the two shared modules first — the identity grammar
(`trace-identity.js`) and the split implementation (`trace-split.js`) — and
re-point every existing consumer (CLI split, trace-multi, trace-github,
public export) at them, since every later step consumes their contracts.
Then rebuild the benchmark runtime pipeline on those modules: convention
paths and lane materialization in the workdir, raw-trace preservation with
split and summary hoisted to the runner's shared path (so the test seam
exercises the real pipeline), run-output-relative record fields, and
deletion of the private splitter. The action and reusable workflow changes
and the documentation updates touch no library code, so they follow as
contract-level work. The whole change lands as one PR: the naming
convention spans runner, action, tests, and docs, and spec requirement 11
(clean break, no aliases) forbids landing the halves separately.

## Parts

| Part | Scope | Depends on |
| --- | --- | --- |
| [plan-a-01](plan-a-01.md) | Shared trace core: identity module, shared split module, CLI rewiring, discovery changes, `gemba-trace` help + goldens | — |
| [plan-a-02](plan-a-02.md) | Benchmark runtime: workdir, task-family, raw-summary, runner, result schema, judge docs, private-splitter deletion, tests | 01 |
| [plan-a-03](plan-a-03.md) | Benchmark composite action, reusable workflow, action-contract test, both action READMEs | — |
| [plan-a-04](plan-a-04.md) | Documentation: `gemba-benchmark`/`gemba-trace` skills, Prove Agent Changes guides | 01, 02, 03 (documents their contracts) |

## Execution

Route all parts to an engineering agent (`staff-engineer` via
`kata-implement`), sequenced 01 → 02 → 03 → 04 on one branch, one PR.
Deliberate deviation for the approver: part 04 is documentation, which
kata-plan defaults to `technical-writer`, but it documents contracts the
same PR lands (record paths, artifact naming, `download` narrowing), so
one implementer avoids a mid-PR handoff.

Libraries used: libharness (trace-identity, trace-split, trace-github,
trace-multi, commands/trace, benchmark/\*, sumTraceCost), libmock
(createMockFs, createTestRuntime), libcli (definition surface only), zod
(existing result schema), yaml (new devDependency of `products/gemba` for
the action-contract test).

## Verification (whole PR)

- `bun test libraries/libharness` and `cd products/gemba && bun test` green.
- `bun run check` green (format, lint, jsdoc, invariants, context).
- Spec criterion 11 sweep returns nothing outside `specs/`:
  `rg --hidden --pcre2 '(?<![.\w-])(agent|supervisor|judge)\.ndjson'`
- Spec criteria on the PR: 1 and 3 via the part-02 e2e assertions
  (criterion 3 drives the `cost` verb handler in-process over the
  preserved raw file and compares the record's agent+supervisor
  breakdown — not `costUsd`, which folds in judge cost); 2 via the
  part-01 split units plus the part-02 step-7 deletion sweep; 4 via the
  part-01 identity round-trip; 8–9 via the part-02 record/redaction
  tests; 10 via the part-03 action-contract test; 11 via the sweep
  above; 12 via parts 03 (action README) and 04. Criteria 5–7 verify
  post-release (published action + pin/Dependabot bumps), not on this PR
  — noted for the release engineer.

## Risks

- **`upload-artifact` v4 archive rooting.** The trace artifact's member
  paths must extract as `runs/<taskId>/<idx>/trace--*` for record-relative
  resolution. v4 roots the archive at the matched files' least common
  ancestor, so the pre-run `<output>/trace-manifest.txt` anchor is
  load-bearing — it cannot be folded into the run step or written under
  `runs/`. The action-contract test covers the glob and manifest, but not
  v4's archiving; the post-release criterion-5 dispatch is the first real
  check of the extraction shape.
- **Published-pin sequencing.** The reusable workflow's shard step invokes
  the published `forwardimpact/benchmark@v1.0.8` action, which does not
  declare the new `trace` input — forwarding it is inert (with a workflow
  warning) until that internal pin advances to the release carrying this
  change. That pin bump is a post-release step for the release engineer,
  distinct from the eval workflows' Dependabot SHA-bump.
- **`findByKey` behaviour change on kata dispatch runs.** Decision 10
  replaces silent first-match with an ambiguity error on the shared
  surface. Automation that relied on first-match (e.g. a bare participant
  present in several cases) starts erroring; the error must list the
  matching member names or the flow is a dead end.
- **`structured.json` narrowing is a cross-surface output change.** Kata
  dispatch bundles, harness matrix bundles (raw + lanes), and eval shards
  are all multi-member, so `download` stops minting `structured.json` on
  every common bundle. Part 04 therefore rewrites every documented
  `structured.json` flow (gemba-trace skill, trace-analysis and run-eval
  guides) to drive the verbs off the downloaded `.ndjson` members, which
  `loadTrace` accepts natively.
- **`runAgent` seam contract change.** Part 02 narrows the internal test
  seam to "stream envelopes to `rawTracePath`, return `{agentError}`" so
  hook-driven tests exercise the real split/summary path. Every
  hook-using test fabricating `costUsd`/`turns`/`submission` must switch
  to envelope fixtures; the seam is documented internal-only, so no
  external consumer breaks.

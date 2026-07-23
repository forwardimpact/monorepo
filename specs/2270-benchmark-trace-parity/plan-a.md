# Plan 2270-a — Benchmark Trace Parity

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Build the two shared modules first — the identity grammar
(`trace-identity.js`) and the split implementation (`trace-split.js`) — and
re-point every existing consumer (CLI split, trace-multi, trace-github,
public export) at them, since every later step consumes their contracts.
Then rebuild the benchmark runtime pipeline on those modules: convention
paths and lane materialization in the workdir, raw-trace preservation and
the one-pass summary in the runner, run-output-relative record fields, and
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
| [plan-a-03](plan-a-03.md) | Benchmark composite action, reusable workflow, both action READMEs | — |
| [plan-a-04](plan-a-04.md) | Documentation: `gemba-benchmark`/`gemba-trace` skills, Prove Agent Changes guides | 01, 02, 03 (documents their contracts) |

## Execution

Route all parts to an engineering agent (`staff-engineer` via
`kata-implement`); part 04 is documentation but documents contracts landed
in 01–03, so keeping one implementer avoids a handoff. Sequence: 01 → 02
sequentially (02 imports 01's modules); 03 may run in parallel with 01/02
(it touches only YAML and READMEs); 04 runs last. All on one branch, one
PR.

Libraries used: libharness (trace-identity, trace-split, trace-github,
trace-multi, commands/trace, benchmark/\*, sumTraceCost), libmock
(createMockFs, createTestRuntime), libcli (definition surface only), zod
(existing result schema).

## Verification (whole PR)

- `bun test libraries/libharness` and `cd products/gemba && bun test` green.
- `bun run check` green (format, lint, jsdoc, invariants, context).
- Spec criterion 11 sweep returns nothing outside `specs/`:
  `rg --hidden --pcre2 '(?<![.\w-])(agent|supervisor|judge)\.ndjson'`
- Spec criteria 5–7 verify post-release (published action + Dependabot
  SHA-bump in eval workflows), not on this PR — noted for the release
  engineer; criteria 1–4 and 8–12 verify on the PR via the tests named in
  parts 01–04.

## Risks

- **`upload-artifact` v4 archive rooting.** The trace artifact's member
  paths must extract as `runs/<taskId>/<idx>/trace--*` for record-relative
  resolution. v4 roots the archive at the matched files' least common
  ancestor, so the pre-run `<output>/trace-manifest.txt` anchor is
  load-bearing — it cannot be folded into the run step or written under
  `runs/`. There is no PR-level test of the extraction shape; the
  post-release criterion-5 dispatch is the first real check.
- **`createMockFs` async-stream fidelity.** The shared split module streams
  via `runtime.fs.createReadStream` + readline; the existing CLI split
  tests drive `fsSync.readFileSync`. If the mock's read stream does not
  compose with `node:readline` `createInterface`, tests for the shared
  module need the real-fs test runtime (`test/real-runtime.js` +
  `mkdtemp`), which several benchmark integration tests already use.
- **`findByKey` behaviour change on kata dispatch runs.** Decision 10
  replaces silent first-match with an ambiguity error on the shared
  surface. Any existing automation that relied on first-match on dispatch
  bundles (e.g. runbooks passing a bare participant present in several
  cases) will start erroring with a candidate list; this is the designed
  accuracy fix, but the error message must list the matching member names
  or the flow is a dead end.
- **`structured.json` narrowing is a cross-surface output change.** Kata
  dispatch bundles (multi-member) stop minting `structured.json` on
  `download`. Anything parsing that file from a multi-member bundle breaks
  loudly; the trace-analysis guide update in part 04 is the notice.

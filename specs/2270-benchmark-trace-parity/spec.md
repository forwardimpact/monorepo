# Spec 2270 — Benchmark Trace Parity: Eval Traces as First-Class Workflow Artifacts

The agent platform has two ways to run agents in CI, and only one of them
keeps the evidence. A `gemba-harness` run (every kata workflow) writes a raw
NDJSON trace of `{source, seq, event}` envelopes, splits it into per-participant
files via `gemba-trace split`, and uploads the bundle as a `trace--<case>`
workflow artifact. The `gemba-trace` CLI consumes those traces natively — the
discovery verbs (`runs`, `find`, `download`) resolve them from a run id, and
the file-consuming verbs (`cost`, `overview`, `timeline`, `stats`, `compare`,
`split`, and the rest of the analysis surface) read them directly.

A `gemba-benchmark` run (every benchmark-driven eval workflow) produces the
same envelope stream per cell through the same supervisor session, then loses
it. The runner deletes the raw combined trace after summing cost, splits with
a private duplicate of the split logic, names the surviving files outside the
shared convention, and the benchmark action uploads only `results.jsonl`. The
traces never leave the ephemeral runner.

This spec makes the benchmark produce traces exactly the way the harness does:
same envelope stream, same file-naming convention, same shared split
implementation, same `trace--*` artifact contract on the workflow — so
`gemba-trace` runs over eval traces natively, with no benchmark-specific
flags, paths, or parsing.

Serves **Teams Using Agents** — the persona whose Gemba job in
[JTBD.md](../../JTBD.md), *Stand Up and Operate an Agent Team*, includes
running sessions, inspecting traces, and measuring outcomes on one platform.
pass@k reports the outcome of an eval. The traces record the agent behaviour
that produced it, and today that record is destroyed at the moment it is
produced, so deep post-eval analysis is impossible.

**Classification: product-aligned.** The change lands on the Gemba product's
composite action and reusable workflow (`products/gemba/actions/`), its
runtime library, and the published documentation of those surfaces.

## Problem

**The raw trace is deleted.** The benchmark runner's agent phase writes the
combined envelope trace per cell (agent, supervisor, and orchestrator
sources), reads it once to sum cost, then unlinks it. The one file that
carries the complete, ordered, envelope-wrapped record of the run — the exact
shape every cross-participant `gemba-trace` verb is built for — exists only
for milliseconds.

**The split logic is duplicated, and has already diverged.** The benchmark
carries its own combined-trace splitter, private to the runner, that
re-implements what `gemba-trace split` does — but handles only the supervise
shape, hard-codes a two-way agent/supervisor bucket, and entangles splitting
with submission and turn extraction. The harness-side splitter handles the
run, supervise, facilitate, and discuss shapes and emits the shared naming
convention. Two implementations of one policy is exactly the drift the
platform's one-cost-path rule (`sumTraceCost` everywhere) was written to
prevent; the split policy never got the same treatment.

**The filenames break the identity convention.** Benchmark cells emit
`agent.ndjson`, `supervisor.ndjson`, and `judge.ndjson` inside per-cell run
directories. The shared convention is
`trace--<case>--<participant>.<role>.ndjson`, and `gemba-trace` derives
identity from it: `compare` labels its sides with case and participant,
`find`/`download` resolve a participant's lane from member filenames alone.
On benchmark traces, identity parsing falls back to bare basenames — every
cell in every eval collapses to the same three anonymous names, so two cells'
traces cannot even be told apart once copied out of their directories.

**No trace artifact is ever minted.** The benchmark action uploads
`results.jsonl` and nothing else; the reusable sharded workflow inherits that.
`gemba-trace find` and `download` resolve traces by the `trace--`
artifact-name prefix and the member-filename convention — both absent on eval
runs — and `runs` can list an eval run but resolves no trace lane inside it.
Deep post-eval analysis of an agent's behaviour is impossible: the runner is
ephemeral and the evidence is gone when the job ends.

**The record points at files that outlive nothing.** Each result record
carries the cell's trace paths — absolute paths on the dead runner. The
paths are schema-required and useless once the job ends.

The kata workflows solved all of this: raw trace kept, one split
implementation, convention-named files, collision-safe `trace--<case>`
artifacts, discovery verbs that work. The eval workflows run the same
platform and get none of it.

## What

One trace pipeline, shared by both products. The benchmark stops owning any
trace policy of its own: capture, naming, splitting, and artifact upload
follow the harness contract, with cell identity taking the place of the
matrix case.

| # | Requirement |
| --- | --- |
| 1 | **Raw traces are preserved.** Every cell keeps its raw combined envelope trace and its judge trace for the life of the run output; the read-once-then-unlink behaviour is removed. Capture is unconditional in the runner — cost derivation and the judge already depend on the trace existing. The action's `trace` input (default on, mirroring the harness action) governs the artifact-upload step and the trace outputs only, never capture. |
| 2 | **One naming convention.** Every trace file the benchmark emits follows the shared convention: the raw file as `trace--<case>.raw.ndjson` and split files as `trace--<case>--<participant>.<role>.ndjson`. A cell's case identity encodes the task and run index and is unique across the whole grid and across shards. The judge is a participant with its own lane in the same convention; which role it classifies under is a design decision, constrained only by the lane parsing under the convention. |
| 3 | **One split implementation.** The benchmark's private splitter is retired. Both the harness path (`gemba-trace split`) and the benchmark runner drive the same shared split code with the same source-to-role classification, and the runner's submission and turn totals survive without a second split implementation existing anywhere. |
| 4 | **Cost stays on the one path.** Per-cell cost continues to be derived from the raw combined trace via the shared cost summation, and `gemba-trace cost` over a preserved cell trace reproduces the record's agent+supervisor spend. |
| 5 | **Artifact parity.** The benchmark action (run mode) uploads every trace file as a workflow artifact whose name carries the `trace--` prefix, under `always()` so failed and timed-out cells keep their evidence, and collision-safe across shards and matrix callers. The reusable sharded workflow forwards the contract so eval workflows mint trace artifacts with no caller-side steps. |
| 6 | **Native discovery.** `gemba-trace runs` lists benchmark-driven eval runs by default, and `find`/`download` resolve a case's or participant's lane from an eval run id exactly as they do for a kata run — via the artifact-name prefix and member-filename convention, never trace content. |
| 7 | **Native analysis.** Every file-consuming `gemba-trace` verb works on eval trace files as-is. Identity parsing resolves case and participant from every split filename the benchmark emits; the raw file carries the same case-only identity a harness raw trace carries today. |
| 8 | **Records stay coherent.** The result record's trace-path fields and the judge template's trace placeholder point at the convention-named files. Relative to the run output directory, a record is enough to locate its cell's traces inside a downloaded artifact. |
| 9 | **Redaction is unchanged.** The preserved and uploaded traces are the same redacted streams written today, and redaction test coverage extends to the newly preserved files — the kept raw trace and the judge lane — so preservation cannot introduce an unredacted sibling. |
| 10 | **Action surface symmetry.** The benchmark action exposes a trace-directory output — one output locating every trace file of the run, with per-cell files discoverable beneath it by the naming convention — mirroring the harness action's trace outputs at the contract level, so downstream steps post-process eval traces the same way kata workflows post-process theirs. |
| 11 | **Clean break.** The old per-cell filenames (`agent.ndjson`, `supervisor.ndjson`, `judge.ndjson`) are removed, not aliased. Documentation and judge templates that name them update in the same change. No compatibility mode ships. |
| 12 | **Documentation.** The `gemba-benchmark` and `gemba-trace` skills and the Prove Agent Changes guides state the eval trace contract: what a run preserves, the artifact shape, and the download-then-analyze flow for evals. |

## Scope

In scope, by surface:

| Surface | Change |
| --- | --- |
| libharness benchmark runner + workdir | Preserve raw per-cell traces; convention-named trace paths with grid-unique case identity; judge lane joins the convention |
| libharness benchmark splitter | Retired in favour of the shared split module |
| libharness trace tooling | Shared split module serves both consumers; `runs` default workflow pattern covers eval workflows; discovery conventions unchanged otherwise |
| Benchmark composite action | `trace` input, trace-directory output, and an `always()` trace-artifact upload step, collision-safe across shards |
| Reusable benchmark workflow | Forwards the trace contract; each shard mints its trace artifact |
| Result record + judge template | Trace-path fields and the agent-trace placeholder follow the new names |
| Eval workflows (`eval-kata`, `eval-jidoka`, `eval-wiki`) | No caller-side logic; pick up the published action/workflow via the standard Dependabot SHA-bump path |
| Tests + goldens | Runner, splitter, action-contract, and identity-parsing coverage moves to the shared convention; help-text goldens refresh where command descriptions change |
| Documentation | `gemba-benchmark` and `gemba-trace` skills; Prove Agent Changes guides (run-benchmark, run-eval, trace-analysis); benchmark action README |

Excluded:

- **Harness action and kata workflows** — already at the target contract;
  untouched.
- **Envelope schema changes** — the `{source, seq, event}` line format is the
  shared contract and does not change.
- **`eval-guide`** — harness-driven, already has trace parity.
- **Artifact retention policy** — expiry and storage budgets stay at the
  repository's existing artifact defaults.
- **New trace-driven scoring** — the grading contract (spec 2240) is
  untouched; the judge's existing read of the agent trace through its
  template placeholder continues unchanged, and no new grading input is
  derived from traces.
- **Cross-run trace aggregation or indexing** — comparing traces across eval
  runs stays a manual `download`-then-`compare` flow; any index is a future
  spec.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | A benchmark run against a family fixture leaves, per cell, a raw combined trace and per-participant split traces, all named per the shared convention, with no post-run deletion | Runner integration test over a fixture family; inspect the run output tree |
| 2 | The benchmark's private splitter is gone and one shared split implementation serves both the harness and benchmark paths | The private module is removed; both consumers import the shared module; split unit tests cover the benchmark shape |
| 3 | `gemba-trace cost` over a preserved cell's raw trace reproduces the record's agent+supervisor cost breakdown | Integration test asserting record cost equals CLI cost over the same file |
| 4 | Identity parsing resolves case and participant for every split filename the benchmark emits, and case identity is unique across cells and shards | Unit test over emitted names, including two tasks × multiple run indexes across shards |
| 5 | A dispatched eval workflow run mints `trace--*` artifacts on every shard, including shards with failed or timed-out cells | Dispatch an eval run; list run artifacts |
| 6 | `gemba-trace runs` lists eval runs by default, and `find`/`download` fetch a cell's lane from an eval run id with the same invocation shape used for kata runs | Commands against a real eval run id |
| 7 | Every file-consuming `gemba-trace` verb produces meaningful output over a downloaded eval trace file with no benchmark-specific flags | Run at least the verbs requirement 7 names (`cost`, `overview`, `timeline`, `stats`, `compare`, `split`) against downloaded eval traces as the representative check |
| 8 | Result records and the judge template placeholder reference only convention-named files that exist | Record validation test; judge unit test |
| 9 | The newly preserved files — the kept raw trace and the judge lane — carry only redacted content | Redaction tests extended to assert both files are written through the existing redactor |
| 10 | The benchmark action exposes a trace-directory output locating every trace file of the run | Action contract test or workflow-level assertion reading the output and listing convention-named files beneath it |
| 11 | Old bare per-cell filenames appear nowhere in code or docs | `rg --hidden '(^|[^.\w-])(agent|supervisor|judge)\.ndjson'` — a boundary that excludes the convention's `.<role>.ndjson` suffixes, `--hidden` so the skills tree is searched — returns nothing outside `specs/` history |
| 12 | Docs state the eval trace contract on every surface that documents benchmark output | Sections exist in both skills, the Prove Agent Changes guides, and the action README |

Criteria 5–7 exercise the published action and reusable workflow, so they
verify in the post-release window — after the sibling publish and the
Dependabot SHA-bump land in the eval workflows — not on the implementing PR.
The remaining criteria verify on the implementing PR.

## Path to approval

Approval is human-only: the spec advances when `wiki/STATUS.md` shows the
`2270` row approved, written from a trusted human signal. Design will decide
the exact case-identity string, the artifact-name shape per shard, the judge
lane's role classification, and where the shared split module lives; none of
those choices may weaken the observable contracts above.

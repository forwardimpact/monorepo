# Spec 1910 — deterministic per-participant trace harvest

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Study-phase work begins with finding the trace of a known run. Today a participant cannot ask the trace tooling "my lane's most recent run": the run matcher filters on workflow names only, so participant-name queries return nothing on dispatch-style hosts, and run records carry no pointer back to the workflow run that produced them. Every trace harvest degrades into a forensic sweep — and the sweep misattributes. |
| Platform Builders | [Evaluate and Improve Agents](../../JTBD.md#platform-builders-evaluate-and-improve-agents) | The trace discovery surface in `libeval` is the shared instrument for locating agent traces. Any consumer building measurement or review on per-participant traces inherits the same gap: discovery keyed by workflow name, attribution by content inspection. |

## Problem

Issue [#1670](https://github.com/forwardimpact/monorepo/issues/1670):
per-participant trace harvest is operationally costly and error-prone.
Two independent gaps compound; all figures below are first-hand session
data recorded on the issue.

**Gap 1 — discovery is keyed by workflow name, never by participant.**
`npx fit-trace runs <pattern>` matches the *workflow* name (e.g. "Kata:
Dispatch"). A participant's name appears in the run's artifact inventory
and trace filenames, which the matcher never reads. `fit-trace runs
release` therefore returns `[]` on every dispatch-style host — nine
attested recurrences in one lane (runs 211, 221, 229, 271, 288, 394,
424, 472, 479).

**Gap 2 — no convention requires run records to point at their host
run.** A CI session knows its own workflow run id (the host environment
exposes it), but nothing obliges the per-run metrics CSV rows written
during the session to record it — some lanes have done so ad hoc, most
rows lack it. Recovering "which workflow run produced this row" later
requires reconstructing a time window and enumerating candidates.

The documented fallback procedure (pin the landing-commit time →
enumerate spanning workflow runs → download candidate artifacts →
content-grep for run markers) was the pre-registered control for gap 1
(issue #1462, resolved as "document the procedure, escalate only if it
proves operationally costly"). The escalation clause has now fired with
measured cost:

| Session | Cost | Outcome |
|---|---|---|
| 2026-06-12 coaching (run-479 study) | ~8 API calls + 4 artifact downloads + 3 marker-greps | **Failed.** Host still `in_progress` at study time; both pinned candidates were wrong hosts; the true host was not on the candidate list at all. |
| 2026-06-12 backfill (runs 418, 428 — no host id recorded) | ~25 API calls + 20 artifact downloads | Succeeded only after content-grep was defeated twice by wiki-echo contamination (later sessions' traces quote earlier run numbers, so marker-grep matches the wrong trace) and attribution fell back to tool-call-level forensics. |
| 2026-06-12 backfill (3 rows where the host run id *was* recorded at write time) | 1 download each | Trivial — the keyed lookup works wherever the key exists. |

Two structural findings sharpen the target:

- **Misattribution is the worst failure mode, not deferral.** Content-grep
  attribution is inference, and the inference fails: traces quote other
  runs' identifiers (wiki-echo), parallel sessions span the same time
  window, and the pinned-candidate procedure selected wrong hosts even
  after completion.
- **Completion lag is bounded but unavoidable at the platform layer.**
  Trace artifacts upload when the host workflow completes (~30–90 min
  for multi-participant hosts); artifacts persist 90 days. A study point
  immediately after a run structurally cannot read that run's trace. The
  miss becomes permanent only if nothing triggers the deferred read
  before artifact expiry — which is exactly what happens when the row is
  un-keyed.

### Out of scope

| Excluded | Why |
|---|---|
| Accuracy of `fit-trace stats` totals | Spec 1820 (decoupled: trusting numbers once a trace is in hand vs getting the trace at all). |
| Per-participant artifact naming on dispatch hosts | Mechanical parity fix with the existing matrix-host convention; ships separately. Both host shapes remain in this spec's scope — see Decision 1. |
| Eliminating completion lag | Artifacts upload at host completion by platform design. This spec converts the deferred read from a forensic sweep into a keyed lookup; it does not promise traces before the host finishes. |
| Backfilling historical un-keyed rows | One-time recovery work, already completed on the issue. This spec is forward-looking. |
| Keying narrative log entries | Metrics CSV rows are the machine-read recovery surface the backfills need; narrative logs are prose memory, recoverable through the keyed rows they accompany. |

## Decisions

1. **Discovery is participant-keyed.** The run-listing surface (`npx
   fit-trace runs`) accepts a participant name and returns the workflow
   runs that contain that participant's trace lane, on both host shapes:
   matrix-style hosts (per-participant artifact names) and dispatch-style
   hosts (shared artifact whose trace filenames carry participant names).
   Participant identity comes from the run's own artifact inventory and
   trace-file naming convention
   (`trace--<case>--<participant>.<role>.ndjson`), never from trace
   *content*. The participant key augments the existing workflow-name
   pattern query; it does not replace it. The contract is deterministic
   attribution with the query's retrieval cost disclosed in its output —
   not zero downloads.
2. **Candidate hosts are reported, not omitted.** Participant identity
   is only confirmable once a host's artifacts exist (Decision 1), so
   *candidacy* — unlike attribution — is derived from the run's workflow
   identity: a still-running or artifact-less run whose workflow is one
   that mints trace artifacts is a candidate. Candidacy is over-inclusive
   by design and always labeled, never silently promoted to a match: the
   query returns such runs with status visible and the match marked
   unconfirmed-pending-artifacts, so "trace not yet available" is
   distinguishable from "no such run". A silent `[]` while a candidate
   host exists is a defect.
3. **Run records are keyed to their host run at write time.** The keyed
   record set is exactly the per-run metrics CSV rows
   (`wiki/metrics/{skill}/{YYYY}.csv`) that end-to-end skills mint per
   KATA.md § Metrics; narrative log entries are exempt from the keying
   obligation. A row written from a CI session includes the session's
   host workflow run id (the host already exposes its own run identity
   to the session); a row written outside CI carries an explicit no-host
   marker rather than a silent omission. The convention is published
   where the metrics conventions live, so every lane inherits it, and
   the field lands in a way that keeps existing CSV consumers — `fit-xmr`
   analysis and the storyboard control charts — working on current-year
   files; how is a design decision.
4. **Attribution is deterministic, never inference-based.** A keyed run
   record resolves to the participant's trace with no time-window
   enumeration, no content inspection, and no candidate ranking. Where a
   key is absent (historical rows, non-CI sessions), the tooling does
   not guess — forensic recovery stays a documented manual procedure,
   outside the tool contract.
5. **Lookup by key is a supported query.** Given a host run id and a
   participant name, the trace tooling produces that participant's lane
   trace in one operation, with no run enumeration and no content
   inspection. This is the deferred-read path that makes completion lag
   a wait, not a search.

## Success Criteria

| # | Claim | Verification |
|---|---|---|
| 1 | A participant-keyed `fit-trace runs` query returns the runs carrying that participant's lane on both host shapes (per-participant artifact names; shared artifact with participant-named trace files). | Fixture tests in the library test suite, one per host shape. |
| 2 | A query window containing an in-progress or artifact-less candidate host includes that run, with status and the unconfirmed-pending-artifacts label, in the output. | Fixture test pinning that the run is present and labeled, not dropped. |
| 3 | The host-run-id recording convention is published where the metrics conventions live. | KATA.md § Metrics carries the convention text. |
| 4 | A metrics CSV row appended by a CI session carries the host run id of the workflow run that wrote it. | Inspect a post-change row in `wiki/metrics/{skill}/{YYYY}.csv` against the run that committed it. |
| 5 | A metrics CSV row minted outside CI carries the explicit no-host marker. | Inspect a locally minted post-change row. |
| 6 | Existing consumers keep reading the affected current-year metrics files. | `npx fit-xmr analyze` succeeds on a post-change file. |
| 7 | Given (host run id, participant), the tooling produces the participant's lane trace path with no run enumeration. | Test against a fixture artifact layout in both host shapes. |
| 8 | No supported path attributes by trace content: a fixture trace whose content quotes a different run id (the wiki-echo shape) perturbs no result. | Fixture test with an echo-contaminated trace. |

One-time illustrative validation for claim 1 — host run 27401632821
carries the release-engineer lane the name-pattern matcher returned `[]`
for — is recorded in Evidence; it expires with artifact retention, so
the fixtures are the durable check.

## Evidence

- Issue [#1670](https://github.com/forwardimpact/monorepo/issues/1670) —
  filing report, coach triage confirming the escalation clause fired,
  release-engineer in-vivo re-test with per-row recovery costs, and PM
  triage fixing this spec's boundary.
- Issue #1462 (closed) — the documented-procedure control whose
  pre-registered escalation clause this spec executes; #1463 carries the
  root-cause verdict that participant names live in per-run artifact
  inventories the matcher never reads.
- Spec 1820 (in review, PR #1649) — companion accuracy spec; this spec
  stands alone, and once both land the Study-phase trace instrument is
  restored end to end (find the trace, then trust its numbers).
- One-time ground truth for claim 1: host run 27401632821 (a dispatch
  host) carries the release-engineer lane that `fit-trace runs release`
  returned `[]` for; valid until that run's artifacts expire.

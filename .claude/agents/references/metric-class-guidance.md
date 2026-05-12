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

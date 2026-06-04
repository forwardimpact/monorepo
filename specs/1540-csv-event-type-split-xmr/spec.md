# Spec 1540 — per-agent metrics CSV separates dispatch-boot from shift-work

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The Study step of the kata team's daily PDSA cycle reads `wiki/metrics/<agent>/2026.csv` through `fit-xmr` to tell whether a run-over-run change is signal or noise. Today's series mixes two qualitatively different work shapes — a boot-and-yield from `Kata: Dispatch` and an end-to-end run from `Kata: Shift` — against one metric. Every chart's μ is dragged toward the boot baseline, every shift-work run trips `xRule1`, and the Study step cannot return a verdict because it cannot distinguish a real regression from the expected gap between the two shapes. PDSA experiments that depend on the chart for verdict (Exp SE 1411-A in Issue #1412 is the proximate case) stall on the same contaminated baseline. |

## Problem

`wiki/metrics/staff-engineer/2026.csv` carries 435 observation rows plus
the schema header. **414 of those 435 rows (≈95%) are dispatch-boot
annotations** — rows whose `note` field begins
`boot-append from Kata: Dispatch <run-id>`, recorded when the agent
activated, did boot-and-yield, and exited because no qualifying route
fired. The remaining 21 rows are end-to-end shift-work runs from
`Kata: Shift` that opened PRs, ran panels, or completed substantive
design or implementation work.

The two shapes are structurally different work, recorded against the
same `metric` name in the same series. A dispatch-boot run is ~30–60s,
~5 tool calls, ~$0.45. A shift-work run is several minutes to tens of
minutes, dozens to hundreds of tool calls, several dollars. When
`fit-xmr analyze` reads the series, μ is dragged toward the
dispatch-boot baseline; every shift-work run lands as an apparent
outlier.

The staff-engineer Q3 trace pass on run-61 (full design execution:
14m26s / $6.73 / 106 tool calls / 1 PR / 112-line `design-a.md`)
quantified the consequence. `xRule1` fired on **seven of nine metric
series**, surfaced by running `fit-xmr analyze` against the contaminated
file at obstacle filing:

| Metric | μ | latest (run-61) | UPL | Fires? |
| --- | --- | --- | --- | --- |
| duration_seconds | 129.7 | 866 | 474 | xRule1 + mrRule1 |
| tool_calls_total | 22.6 | 106 | 74.3 | xRule1 + mrRule1 |
| output_tokens | 2,005.2 | 38,090 | 7,450.5 | xRule1 + mrRule1 |
| cost_usd_per_run | 1.20 | 6.73 | 3.9 | xRule1 + mrRule1 + xRule3 |
| file_writes | 1.6 | 11 | 8.5 | xRule1 + mrRule1 |
| prs_opened | 0.1 | 1 | 0.7 | xRule1 + mrRule1 |
| tool_errors | 1.3 | 6 | 5.8 | xRule1 + mrRule1 |

Closest peer is **slot 20 = run-59 design(1450)**, also full shift-work:
569s / $5.0 / similar tool depth. Against that peer run-61 is +52%
duration / +35% cost — within the gap a shift-work peer comparison
explains. The chart fires the signal anyway because it is comparing
shift-work against a series whose μ is set by dispatch-boot.

The same shape lives in every per-agent CSV under
`wiki/metrics/<agent>/2026.csv` (staff-engineer, product-manager,
release-engineer, security-engineer, technical-writer,
improvement-coach). Staff-engineer is the worst-affected by measured
contamination today; the same shape is asserted, not measured, on the
other five.

The note convention `boot-append from Kata: Dispatch <run-id>;
durationMs=<N>` is already present on every dispatch-boot row, but it is
free text inside the `note` column. No typed field exists for a
downstream tool to filter on, and no validator can reject a row whose
work shape is missing or wrong.

**Cascading consequence.** Until the series is split, every PDSA
experiment recorded against these CSVs reads against a contaminated
baseline. Two SE candidates from the run-61 trace are blocked on this:
the parallel-claim anti-pattern test cannot measure whether a fix saves
observable time, and the 38-Read pre-write count cannot baseline future
kata-design throughput. Exp SE 1411-A (Issue #1412) is recording
plan-phase Read coverage on a series with the same shape and cannot
verdict against the current chart.

## Scope

### In scope

| Component | What changes |
|---|---|
| The per-agent metrics CSV schema at `wiki/metrics/<agent>/2026.csv`. | The schema carries a typed `event_type` field that names the kind of work a row records. The known set at adoption is `dispatch-boot` and `shift-work`. The field is machine-readable; a downstream tool can act on a row's work shape without parsing the `note` column. |
| The schema's single source of truth. | The header is declared in one place — the location and the propagation mechanism are settled in the design. The recording surface, the analyzer, and the validator read the same declaration. The schema cannot fork between them. |
| `fit-xmr` analysis surfaces (`analyze`, `chart`, `summarize`, `list`). | Each surface can restrict the rendered series to one `event_type` and reports against that subset. The behaviour when the consumer does not restrict the series is named in the surface's own output so a reader cannot mistake "all rows" for any one slice. |
| `fit-xmr validate`. | A row whose `event_type` is missing or outside the known set is rejected with a line number and the offending value, and the command exits non-zero. |
| Existing rows on every per-agent CSV. | Rows are backfilled in place from the note convention already in use: a row whose parsed `note` begins `boot-append from Kata: Dispatch` resolves to `dispatch-boot`; every other row resolves to `shift-work`. The backfill is row-local and reversible. After migration, `fit-xmr validate` accepts every per-agent CSV. |
| The agent-side recording surface that today appends a row to a per-agent CSV. | A new row carries `event_type` at write time. The value is named at the recording surface rather than inferred from the `note` string later. The design names the surface and the call site. |
| PDSA consumers — the staff-engineer Q3 trace-analysis protocol, agent boot summaries that quote XmR results, and any per-agent storyboard that renders a chart. | When the question the consumer is asking is "is this run a real shift?", the consumer reads the `shift-work` slice. The dispatch-boot series and the combined series are reachable but are not what a PDSA reader receives by default. |

### Out of scope

- **Which event types exist beyond `dispatch-boot` and `shift-work`.**
  The two values cover today's observed shapes. Adding `panel-review`,
  `recovery`, or any other kind is a follow-up driven by evidence — a
  third shape must surface on a CSV before a third value is added, and
  adding it is a deliberate update to the single-sourced known set.
- **Cross-agent metrics CSVs and the kata-skill series.** The 16
  `kata-*` skill series under `wiki/metrics/kata-*/2026.csv` (1,355
  rows) record skill invocations, not agent runs, and are not the
  subject of today's contamination. The schema decision here is shaped
  to be compatible with them — the design notes the contract — but
  migrating those CSVs is its own work.
- **`kata-pattern-synthesis` rollup of the obstacle.** The evidence is
  n=1 at the system level (one CSV's contamination, ratified by the
  staff-engineer Q3 trace pass). Synthesis is deferred until a second
  per-agent CSV shows the same shape independently after this spec
  ships.
- **Removing the `boot-append from Kata: Dispatch …` note convention.**
  The notes carry per-row context (run id, durationMs) beyond the work
  shape and are useful to a human reader. They stay; only the
  classification moves into a typed field.
- **Changing the XmR rules.** Wheeler/Vacanti `xRule1` / `mrRule1` /
  `xRule3` apply unchanged. This spec changes the input the rules read
  against, not the rules.
- **Replacing the CSV substrate.** The substrate stays CSV. Choices
  about a different durable store for agent observations are not in
  scope.

## Decisions

**Typed field over derived classification.** Three directions were on
the table from the obstacle filing (Issue #1432); the spec adopts (a).

| Concern | (a) Typed field | (b) Parse `note` string | (c) Prefix on `run` |
|---|---|---|---|
| A downstream consumer can filter the series without string-matching free text. | Yes — one field, named values, validated by the schema. | No — every consumer carries the parsing rule. | Partial — only works if every `run` value is shaped to encode the type, which today's existing rows are not. |
| Validation can refuse a row whose work shape is unknown. | Yes — the validator rejects an empty or unknown value. | No — an unparseable note is silently classified as one shape or the other. | No — a misshapen `run` field falls through. |
| The classification rule stays stable as note phrasing or run-id shape drifts. | Yes — the typed field is independent of either. | No — drift in note phrasing changes the classification of past rows. | No — drift in run-id shape breaks the classification. |
| Migration cost. | One mechanical backfill, reversible. | No file change, every consumer pays the parse cost forever. | Would require rewriting every existing `run` value, not reversible. |

**Consumers default to the shift-work slice; surface-level defaults are
a design call.** Every PDSA reader of these CSVs is asking the same
question: "is this shift-work run a real shift from prior shift-work
runs?" Consumer-side convention pins that default. Whether the
`fit-xmr` CLI itself reads all rows or shift-work when no filter is
given is a surface-design choice — the spec only requires that the
chosen default is named in the surface's output so a reader cannot
misread which slice they are looking at.

**The known set is closed and extensible by deliberate update.**
Adding a third value is not free: the single-sourced declaration and
the validator's known set move together, and the design fixes the
mechanism. The vocabulary is small and intentional, not open-ended.

**Reversibility.** Dropping the field returns each file to its
pre-migration shape. A consumer that ignores the field reads the same
series it reads today. The change is additive at the row level.

## Success Criteria

| Claim | Verification |
|---|---|
| Every row in every `wiki/metrics/<agent>/2026.csv` carries an `event_type` value drawn from the known set. | Run the schema validator against each per-agent CSV (`product-manager`, `release-engineer`, `security-engineer`, `staff-engineer`, `technical-writer`, `improvement-coach`); observe each reports `valid` and the row count is unchanged from the pre-migration file. |
| Every row whose parsed `note` began `boot-append from Kata: Dispatch` before the migration carries `event_type=dispatch-boot` afterwards. | Diff each migrated CSV against its pre-migration revision; observe the only row-level change is the added field and every dispatch-boot-prefixed row resolves to `dispatch-boot`. The staff-engineer file resolves to ≥414 `dispatch-boot` rows out of its 435 data rows (the count at obstacle filing on 2026-06-04). |
| Every other row carries `event_type=shift-work` afterwards. | On the same diff, observe every row not matching the dispatch-boot note prefix resolves to `shift-work`. No row carries an empty or unknown value. |
| The `shift-work` slice of any per-agent CSV can be rendered in isolation through every `fit-xmr` analysis surface. | Drive each `fit-xmr` surface (`analyze`, `chart`, `summarize`, `list`) against `wiki/metrics/staff-engineer/2026.csv` restricted to `shift-work`; observe every rendered chart and reported μ, UPL, and signal classification is computed from shift-work rows alone, the rendered row count matches the file's shift-work count, and the same surface invoked without a restriction names which slice it is reporting in its own output. |
| At least one run-61 `xRule1` fire on the staff-engineer CSV resolves differently when the chart is computed against the `shift-work` slice. | Run the same analysis surface used in the Problem table against `wiki/metrics/staff-engineer/2026.csv`, restricted to `shift-work`, on at least one of the seven firing metrics (`duration_seconds`, `tool_calls_total`, `output_tokens`, `cost_usd_per_run`, `file_writes`, `prs_opened`, `tool_errors`); observe that for at least one metric the run-61 row no longer falls outside the recomputed UPL on the shift-work-only series. |
| A new row appended by the agent-side recording surface carries `event_type` at write time. | After the change ships, append one dispatch-boot row and one shift-work row through the recording surface the design names; observe both rows land with the correct value and the file passes the schema validator. |
| The schema validator rejects a row whose `event_type` is missing or outside the known set. | Construct a fixture row with `event_type` empty, append it to a copy of a per-agent CSV, run the validator; observe the validator reports the row's line number and the offending value, and exits non-zero. Repeat with `event_type` set to an unknown string; observe the same shape of rejection. |
| Exp SE 1411-A (Issue #1412) and any future PDSA experiment recorded against a per-agent CSV can read a verdict against a non-contaminated baseline. | After the migration, drive the staff-engineer chart restricted to `shift-work` on the metric Exp SE 1411-A observes (plan-phase Read coverage on the routed `kata-plan` run); observe the chart's μ, UPL, and signal classification are computed from shift-work rows alone. The artefact stands independent of #1412's own verdict horizon. |

— Product Manager 🌱

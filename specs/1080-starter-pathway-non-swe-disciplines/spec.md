# spec(1080): Starter pathway disciplines + capabilities for data_engineering and engineering_management

Addresses [#985](https://github.com/forwardimpact/monorepo/issues/985).

## Persona and job

Primary:
[Empowered Engineers → Find Growth Areas](../../JTBD.md#empowered-engineers-get-judgment-grounded-in-the-standard).
Big Hire: "Help me get guidance and evidence grounded in my organization's
standard, not impressions or generic advice."

Secondary (same surface inherits):
[Empowered Engineers → Understand Expectations](../../JTBD.md#empowered-engineers-see-whats-expected-of-humans-and-agents)
and
[Engineering Leaders → Define the Engineering Standard](../../JTBD.md#engineering-leaders-define-the-engineering-standard).
Each depends on the standard being able to model any discipline the organization
runs — not just Software Engineering.

## Problem

The starter pathway content shipped by `fit-map init` declares one discipline
and two capabilities:

```text
products/map/starter/disciplines/   software_engineering.yaml
products/map/starter/capabilities/  delivery.yaml  reliability.yaml
```

The canonical synthetic substrate (`data/synthetic/story.dsl`) declares three
disciplines in active use at the worked-example organization:

```text
disciplines { software_engineering 60%  data_engineering 25%  engineering_management 15% }
```

So roughly **40% of the canonical synthetic population** — every Data Engineer
and every Engineering Manager — maps to a discipline the standard cannot model.
Concretely:

| Surface | Observed behaviour for a Data Engineer persona (`daedalus@bionova.example`) |
| --- | --- |
| `fit-landmark readiness --email daedalus@bionova.example --target J090` | Fails. Surface error is a starter-level-ladder issue (J080/J090 not declared in starter `levels.yaml`) — tracked separately, out of scope here. The discipline cause underneath is exposed by `fit-landmark health`: Summit growth alignment is skipped because `data_engineering` is not a known discipline. |
| Find-Growth-Areas Big Hire | Structurally unanswerable — no discipline ⇒ no level expectations ⇒ no readiness checklist ⇒ no gap surface. |
| Substrate roster reach | Approximately 40% of the canonical roster (substrate proportions: `data_engineering 25%` + `engineering_management 15%`) maps to missing disciplines. Athena is the only `engineering_management` persona in the substrate roster. |

The capability set is shaped the same way. The substrate's `roster:` entries
reference fourteen skill IDs (`data_integration`, `data_modeling`,
`stakeholder_management`, `team_collaboration`, `mentoring`,
`performance_optimization`, `architecture_design`, `cloud_platforms`,
`regulatory_compliance`, `risk_management`, `product_thinking`,
`incident_management`, `code_review`, `full_stack_development`). Zero of these
appear under `products/map/starter/capabilities/`:

```text
$ rg -l 'id: (data_integration|data_modeling|stakeholder_management|team_collaboration|mentoring)' products/map/starter/
(no matches)
```

So even if the discipline files existed, the skills they have to declare as
`coreSkills` / `supportingSkills` / `broadSkills` would not resolve in the
capability catalog. The discipline gap and the capability gap are one body of
content work.

## Why now

`kata-interview` run on 2026-05-17 (Landmark, BioNova J080 Data Engineering
Manager persona, `daedalus@bionova.example`) hit the structural wall and filed
issue [#985](https://github.com/forwardimpact/monorepo/issues/985). The persona
walked in from a "not quite J090" annual-review verdict and discovered the tool
literally cannot evaluate their discipline. The Big Hire framing — "grounded in
our organization's standard" — is the whole product pitch; if a discipline is
absent from the standard, the product cannot deliver that hire to anyone
working in it. Athena (the only engineering_management persona in the substrate
roster) would hit the same wall on self-assessment, as would every Data
Engineer in the org.

## Scope

| Row | Change | Excluded |
| --- | --- | --- |
| 1 | Add `disciplines/data_engineering.yaml` to starter content. | Substrate's `clinical_informatics` and `quality_engineering` disciplines (BioNova-specific; not generic enough for a starter template). |
| 2 | Add `disciplines/engineering_management.yaml` to starter content. | Management track sub-structure or alternate management-only level scales — starter stays single-ladder. |
| 3 | Extend starter capability content so every skill referenced by any starter discipline (rows 1–2 plus the existing software_engineering.yaml) is defined inside some capability file under `products/map/starter/capabilities/`. The minimum skill set per new discipline is whatever satisfies criterion 3 (substrate readiness) — design picks the specific skill IDs. | The exact partition of skills across capability files (new files vs extending existing files) and the total capability count are design-determined. |
| 4 | Update `products/map/starter/disciplines/_index.yaml` and `products/map/starter/capabilities/_index.yaml` to list every starter file in the corresponding directory. | Index-generator code path itself; only the data files. |
| 5 | Preserve the existing `software_engineering.yaml` content unchanged. Its three current skill references (`task_completion`, `planning`, `incident_response`) MUST continue to resolve in capability content after row-3 changes. | Reshaping `software_engineering.yaml`'s skill set or behaviour modifiers. |

**Not in scope** (single home for everything excluded):

- Other starter content: `levels.yaml`, `tracks/`, `behaviours/`,
  `drivers.yaml`, `questions/`, `standard.yaml` — the starter level ladder is
  reused as-is. The narrative-arc J080→J090 personas the substrate roster
  carries depend on a separate level-ladder extension tracked outside this spec;
  this spec only restores the discipline surface for personas whose level falls
  inside the current ladder.
- Director-tier rollup (issue
  [#955](https://github.com/forwardimpact/monorepo/issues/955)) — aggregation
  surface, disjoint scope.
- The synthetic terrain DSL (`data/synthetic/story.dsl`) and `fit-terrain build`
  — substrate stays the anchor; this spec aligns starter to substrate, not the
  other way round.
- `fit-landmark` and `fit-map` command behaviour — code paths unchanged; only
  data files change.

## Success criteria

Each criterion is a single observable property with the command or location
that verifies it.

| # | Property | How to verify |
| --- | --- | --- |
| 1 | Every discipline id declared in the canonical substrate's `terrain.disciplines` proportions block at `data/synthetic/story.dsl` has a matching `disciplines/{id}.yaml` file under `products/map/starter/`. | Set-equality between the two id sets: substrate proportions block names `software_engineering`, `data_engineering`, `engineering_management`; corresponding files exist at `products/map/starter/disciplines/{id}.yaml`. |
| 2 | Every skill ID referenced by `coreSkills`, `supportingSkills`, or `broadSkills` in any starter discipline file resolves to a `skills[].id` declared in some starter capability file. | `bunx fit-map validate` exits 0 against starter content. The closure property is enforced by `validateDisciplineSkillRefs` in `products/map/src/validation/discipline.js` — passing validation is the verification. |
| 3 | For every persona in the canonical substrate roster whose `level` is within the starter `levels.yaml` ladder, `fit-landmark readiness --email <persona-email> --target <persona-target-level>` does not surface the `Unknown discipline` error at `products/landmark/src/commands/readiness.js`. | Build the roster (e.g. `bunx fit-terrain build` against `data/synthetic/story.dsl`), iterate personas, run readiness, assert zero `Unknown discipline "..."` strings (capital U, exact code-emitted format) across stderr/stdout. Personas whose `level` falls outside the starter level ladder are excluded from this criterion — the level ladder is out of scope (tracked separately) and would mask discipline failures with `Unknown level`. |
| 4 | `fit-landmark health` against any substrate persona within the level ladder no longer surfaces the Summit growth-alignment skip caused by an unknown discipline. | The exact emitted format is `Summit growth alignment skipped: ${err.message} (code: ${err.code ?? "unknown"})` at `products/landmark/src/lib/summit.js`; criterion is met when no health-output line carries that prefix with a discipline-not-found error code. |
| 5 | The `_index.yaml` files under `products/map/starter/disciplines/` and `products/map/starter/capabilities/` list every `.yaml` file present in the same directory (excluding `_index.yaml` itself). | Set-equality between (a) directory file ids minus `_index` and (b) `files:` entries of `_index.yaml` in that directory. Browser-loading path depends on this index being current; mechanism to compute the set diff is design-determined. |
| 6 | Existing `software_engineering.yaml` continues to validate. Its three skill references (`task_completion`, `planning`, `incident_response`) remain resolvable after capability changes — these IDs MUST still be declared in some starter capability file. | `bunx fit-map validate` passes; readiness for a `software_engineering` persona at a starter-ladder level produces the same discipline/level/track resolution as pre-change. |

## What is *not* the problem

- **Not a code bug.** `fit-landmark`, `fit-map`, and the validator behave
  correctly today: they fail loudly when a referenced discipline or skill is
  missing. The fix is missing data, not broken code.
- **Not a substrate bug.** `data/synthetic/story.dsl` declares the disciplines
  the worked example needs; the starter is the artifact that lags.
- **Not an aggregation surface.** Issue #955 covers the director-tier rollup
  question — kept distinct so per-person evaluability ships without waiting on
  aggregation design.
- **Not a level scale change.** The existing starter `levels.yaml` ladder is
  reused as-is. Management may map onto the same ladder; how the discipline
  expresses its management nature is a design decision (see § Deferred to
  design).

## Deferred to design

The design phase (`kata-design`) decides:

- Capability shape — how many capabilities the starter ships and how skill IDs
  partition across them.
- Discipline shape for `engineering_management` — whether it represents a
  management role distinct from IC, and what flag/summary structure expresses
  that.
- Behavioural shaping — how each new discipline modifies behaviour
  expectations relative to baseline.
- Agent-section depth — how rich the agent-facing content is per new
  discipline.
- Skill selection — the exact set of skills each new discipline declares as
  core / supporting / broad. The substrate's roster is one defensible source;
  the design may choose a leaner or richer set as long as criterion 2
  (closure), criterion 3 (substrate readiness), and criterion 4 (health
  output clean) all pass.

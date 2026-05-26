# Spec 0890 — Kata-Skills Benchmark Family (v1, no ablation)

## Problem

The monorepo publishes `forwardimpact/kata-skills` (the `kata-*` skill pack)
and tells external users that installing it makes their agent teams better at
agent-team work — writing specs, designing, planning, reviewing, releasing.
Today that claim is taken on faith. There is no reproducible measurement of
agent-team outcomes against the pack, and no way to detect a regression when a
skill is edited.

Spec [#870](../870-fit-benchmark-coding-tasks/spec.md) shipped `fit-benchmark`:
a harness with a task-family layout, hidden grading, judge phase, a
`skillSetHash` per result record (derived from each family's `apm.lock.yaml`
bytes), and pass@k aggregation across runs. That harness is plumbing. The toy
`tf/{pass,fail,…}` fixtures it ships only exercise the harness's own contracts
— they do not say anything about whether the `kata-*` pack works.

Two structural gaps remain between the harness and a defensible baseline for
the kata pack:

1. **No task family targets the kata pack.** The kata skills do not write
   code — they write artefacts (specs, designs, plans, review findings) and
   enforce process (READ-DO/DO-CONFIRM checklists, severity-tagged findings,
   panel reviews). The harness supports artefact grading, but no concrete
   tasks exercise the kata skills against it.

2. **No operational cadence.** A measurement nobody runs is a measurement
   nobody trusts. Without a workflow on `main` and a path-filtered PR job,
   drift goes unnoticed until users complain.

This spec closes those two gaps with the **smallest viable benchmark** —
one task family, one task, one configuration, one pass@k number per run.
Methods that compare against a counterfactual (ablation pairs,
"with-vs-without" deltas, skill-positive thresholds) are explicitly out of
scope here and are revisited in a follow-up spec once v1 has produced
enough runs to know what the baseline looks like.

The blast radius of the gap is the JTBD this work serves: Platform Builders
cannot point to any reproducible kata-skill measurement at all. Kata-skill
PRs ship on reviewer impressions, identical to the pre-`fit-benchmark` state
for coding skills.

## Personas and Job

The hire is **Platform Builders**, against the Big Hire "Help me prove whether
agent changes improved outcomes with reproducible evidence"
([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve Agents).
This is the same job spec #870 serves; this spec exercises that harness on
the real published kata pack rather than toy fixtures, producing the first
reproducible pass@k number against `forwardimpact/kata-skills`.

The downstream beneficiary is the Kata product's external audience — they
inherit the benefit when Kata can evidence its own claim — but they are not
the direct hire and the work changes nothing they consume. End users running
agents in production are not in scope.

## Scope

### In scope

| Component | What changes |
|---|---|
| Benchmarks root | A new top-level `benchmarks/` directory hosts task families per skill pack under test. The directory carries a catalog README explaining the per-family layout and how to add a new family. The layout is forward-compatible with additional families (e.g., a future `fit-skills` family) without paint-into-a-corner constraints. |
| Single kata-skills family | One task family under `benchmarks/` is a valid `fit-benchmark` family per spec #870's contracts: an `apm.lock.yaml` at its root, the `forwardimpact/kata-skills` pack staged under its `.claude/skills/`, and the judge agent profile staged under its `.claude/agents/`. The family's directory name is a design choice. |
| v1 task set | The family ships exactly **one** task in v1, targeting one kata skill whose contract is concrete enough to grade structurally. Validating the single-task end-to-end loop is the v1 goal; adding tasks is deferred to a follow-up spec. |
| Task: `kata-spec/write-feature-spec` | Agent input: a brief problem statement and a reference to a JTBD persona+job. Agent output: a `spec.md` at a prescribed path. Structural rubric: grades against the quality bar `kata-spec` itself publishes (problem stated first with evidence, specific scope naming entities and exclusions, verifiable success criteria, no implementation HOW, a named JTBD persona+job from `JTBD.md`). Judge rubric: the spec addresses the brief, not just structural compliance. Pass = structural and judge verdicts both pass. |
| Family staging | The kata pack is staged into the family's `.claude/` tree at build time, not checked in. The staging mechanism translates whatever the pack's publisher emits into the layout `fit-benchmark`'s family installer expects (i.e., `.claude/skills/` + an `apm.lock.yaml` whose bytes are stable across reruns so `skillSetHash` is stable). The exact translation is a design choice; the spec asserts only that the staged tree is a valid family per spec #870. |
| Fixture safety property | Every task fixture and input checked into the family is unambiguously machine-skippable as a fixture without parsing the artefact body, so downstream agents crawling the repo do not consume them as real artefacts. The specific marker mechanism (front-matter token, directory marker file, path-shape convention, or any combination) is a design choice. |
| Workflow triggers | A dedicated GitHub Actions workflow runs the family on three signals: manual dispatch (for cost control); a weekly schedule on `main`; and pull-request paths-filter scoped to changes that could affect benchmark outcomes (in-repo kata-skill sources and the benchmark family tree). Concurrency on the same PR ref cancels in-progress runs. |
| PR-job staging from in-repo sources | The path-filtered PR job stages the family from the **in-repo** `.claude/skills/kata-*` sources, so the change under review is what gets graded — not the previously-published `latest`, which would not yet contain the PR's edits since `kata-skills` publishes only on push to `main`. Manual-dispatch and scheduled invocations stage from the published pack. The differentiation is internal to the build step; v1 does not extend the result-record schema to tag the regime. |
| Cost envelope | Every workflow invocation runs the v1 task set inside a fixed cost envelope: a single pinned cheap model, a fixed run count per task, and a fixed max-turn cap per session. The envelope target is ≤ $5 per workflow invocation, summing the `costUsd` field already on every result record. The specific configuration values are design choices; the spec asserts the envelope target and the recording substrate. |
| Reporting | The workflow writes a pass@k table for the v1 task set to the GitHub Actions job summary and uploads the result-record JSONL artefact. v1 reports the single-arm number per task; no delta, no threshold, no "skill-positive" label. |
| Documentation | The benchmarks catalog README documents the per-family layout and how to add a new family. The family's own README documents the family-local conventions and links to spec #870 for the substrate-level operational notes (skill-pack staging, sandbox flags, agent-cwd discipline, judge-profile-only-for-v1). The substrate notes are not re-enumerated in this spec or the family README. |

### Out of scope, deferred

- **Ablation methodology.** v1 measures a single arm only. A counterfactual
  arm (with-vs-without the pack, with-vs-without a specific skill) is a
  separate spec, revisited once v1 has produced enough runs to characterise
  baseline variance. Until then there is no "skill-positive" verdict, no
  delta table, no paired without-kata family, and no minimum-viable
  skill-set definition.
- **Additional kata-skill tasks.** v1 ships one task; tasks for other
  `kata-*` skills (`kata-plan`, `kata-review`, `kata-implement`, and the
  rest) are deferred to a follow-up spec once the v1 loop is validated
  end-to-end on the single task.
- **Other skill packs.** The directory layout under `benchmarks/` admits
  more families. A family targeting the `fit-*` pack would evaluate
  library-CLI competence rather than agent-team artefacts and is a
  separate spec.
- **Cross-model comparison.** The result schema already carries `model`;
  rendering a Sonnet-vs-Haiku comparison is a separate report mode.
- **A leaderboard or XmR control chart of pass@k over time.** The JSONL
  artefact is the substrate; visualisation comes later.
- **CI gating on pass@k.** v1 reports pass@k; merge decisions on
  kata-skill PRs remain reviewer judgement. Promoting any number to a
  hard merge gate requires baseline-noise calibration that v1 does not
  yet have.
- **Pin-vs-in-repo regime tagging on the result record.** v1 differentiates
  the two staging paths inside the workflow build step but does not extend
  the harness's result-record schema. A schema extension is a substrate
  change and lands with the ablation spec when there is a second arm to
  distinguish.
- **Per-task agent profile.** v1 leaves the harness's agent-profile selector
  unset so behaviour comes from the skill alone.
- **Grading-only mode and replay-from-trace.** Each run is a fresh agent
  session that runs end-to-end.
- **Container isolation.** Inherited from spec #870 — out of scope here too.

## Success Criteria

| Claim | Verification |
|---|---|
| The benchmarks root hosts a kata-skills family that the harness loads. | Test: `fit-benchmark run --family benchmarks/<family>` loads successfully and the family's per-task pre-flight passes for the v1 task. |
| The family is a valid `fit-benchmark` family per spec #870. | Test: the family carries an `apm.lock.yaml` at its root; its `.claude/skills/` contains the kata pack staged from the publisher's emitted layout; its `.claude/agents/` contains the judge profile the workflow invokes; the harness's family-install and judge-profile pre-flight checks pass. |
| `skillSetHash` is stable across reruns and changes when the lockfile changes. | Test: two runs against the same staged family produce result records with identical `skillSetHash`; a one-byte change to the family's `apm.lock.yaml` changes `skillSetHash`. |
| v1 ships exactly one task and exercises the named skill. | Test: the family's `tasks/` tree contains exactly `kata-spec/write-feature-spec`; the task's instructions reference its task-local input set. |
| The task carries the inputs the agent needs and hidden grading material that scores the agent's artefact against the skill's own contract. | Test: the v1 task's grading material lives outside the agent's working directory per spec #870's hidden-grading contract and asserts the rubric named in the In-scope table (the quality bar `kata-spec` publishes plus the judge's brief-addressed check). |
| Every fixture artefact is machine-skippable without parsing its body. | Test: a downstream consumer that walks the repo and applies the chosen marker mechanism does not see the task's fixture body; the mechanism is documented in the family README. |
| The workflow fires on the three documented signals and bounds spend. | Test: the workflow file declares a manual dispatch trigger, a weekly schedule on `main`, and a pull-request trigger paths-filtered to changes that could affect benchmark outcomes (in-repo kata-skill sources and the benchmark family tree); the workflow declares per-PR-ref concurrency that cancels in-progress runs. |
| The PR-job staging path uses in-repo kata-skill sources. | Test: the PR job's build step stages the family's `.claude/skills/kata-*` from the in-repo skill directories rather than the published pack; the manual-dispatch and scheduled paths stage from the published pack. |
| The cost envelope is asserted at the invocation site and measurable from result records. | Test: the workflow pins a single model, a fixed run count, and a fixed max-turn cap at the invocation site; the sum of `costUsd` across the workflow's v1 invocation is ≤ $5 on a representative run. |
| Reporting emits a single-arm pass@k table. | Test: given the v1 task's result-record set, the reporting step writes a markdown table to the GitHub Actions job summary listing per-task `pass@1` (and any other pass@k the workflow chose to surface); the JSONL artefact is uploaded as a workflow artefact. The reporting step does not emit a delta column, a paired without-kata column, or a "skill-positive" label. |
| Documentation cites substrate operational notes rather than repeating them. | Test: the benchmarks catalog README and the family README link to spec #870 for substrate-level operational guidance and do not re-enumerate those notes inline. |

— Product Manager 🌱

# Spec 890 — Kata-Skills Benchmark Family with Ablation Methodology

## Problem

The monorepo publishes `forwardimpact/kata-skills` (the `kata-*` skill pack)
and tells external users that installing it makes their agent teams better at
agent-team work — writing specs, designing, planning, reviewing, releasing.
Today that claim is taken on faith. There is no reproducible measurement of
whether the pack changes outcomes, and no way to detect a regression when a
skill is edited.

Spec [#870](../870-fit-benchmark-coding-tasks/spec.md) shipped `fit-benchmark`:
a harness with a task-family layout, hidden grading, judge phase, a
`skillSetHash` per result record (derived from each family's `apm.lock.yaml`
bytes), and pass@k aggregation across runs. That harness is plumbing. The toy
`tf/{pass,fail,…}` fixtures it ships only exercise the harness's own contracts
— they do not say anything about whether the `kata-*` pack works.

Three structural gaps remain between the harness and a defensible claim about
the kata pack:

1. **No task family targets the kata pack.** The kata skills do not write
   code — they write artefacts (specs, designs, plans, review findings) and
   enforce process (READ-DO/DO-CONFIRM checklists, severity-tagged findings,
   panel reviews). The harness's three grading surfaces (running-service,
   repo state, process exit) support artefact grading, but no concrete tasks
   exercise the kata skills against them.

2. **No ablation contrast.** Even a passing run with the pack installed is
   uninterpretable on its own: a sufficiently capable model passes some tasks
   without any skill pack. The claim "the skills moved the needle" requires
   a paired run with the skills absent, and a result-record stream that
   distinguishes the two arms.

3. **No operational cadence.** A measurement nobody runs is a measurement
   nobody trusts. Without a scheduled job on `main` and a path-filtered PR
   job, drift goes unnoticed until users complain.

The blast radius of the gap is the JTBD this work serves: Platform Builders
cannot prove whether a `kata-skills` change improved agent-team outcomes.
Kata-skill PRs ship on reviewer impressions, identical to the
pre-`fit-benchmark` state for coding skills.

## Personas and Job

The hire is **Platform Builders**, against the Big Hire "Help me prove whether
agent changes improved outcomes with reproducible evidence" ([JTBD.md](../../JTBD.md)
§ Platform Builders: Evaluate and Improve Agents). This is the same job spec
#870 serves; this spec exercises that harness on a real published pack rather
than toy fixtures.

The downstream beneficiary is the Kata product's external audience — they
inherit the benefit when Kata can evidence its own claim — but they are not
the direct hire and the work changes nothing they consume. End users running
agents in production are not in scope.

## Scope

### In scope

| Component | What changes |
|---|---|
| Benchmarks root | A new top-level `benchmarks/` directory hosts task families per skill pack under test. The directory carries a catalog README explaining the per-family layout and how to add a new family. |
| Sibling-family ablation shape | The ablation is realised as **two sibling task families** under `benchmarks/` — a "with-kata" family that stages the `forwardimpact/kata-skills` pack into its `.claude/` tree, and a "without-kata" family that stages a minimum-viable skill set. Each family is independently a valid `fit-benchmark` family with one `apm.lock.yaml` at its root; the two lockfiles differ, so the harness's `skillSetHash` differs between arms per spec #870's contract. Naming for the two siblings is a design choice. |
| Minimum-viable skill set | The "without-kata" family's `.claude/` tree contains exactly what `fit-benchmark`'s family-install and per-task pre-flight require — the judge agent profile under `.claude/agents/` and an empty `.claude/skills/` directory — and its `apm.lock.yaml` declares no `kata-*` packages. Definition is fixed so the ablation contrast is reproducible. |
| Shared v1 task set | Three tasks, each targeting one kata skill whose contract is concrete enough to grade structurally. Both sibling families carry the same task tree; whether the duplication is realised by copy, symlink, or build-time templating is a design choice. Scope is fixed at three tasks; expansion is deferred. |
| Task: `kata-spec/write-feature-spec` | Agent input: a brief problem statement and a reference to a JTBD persona+job. Agent output: a `spec.md` at a prescribed path. Structural rubric: grades against the quality bar `kata-spec` itself publishes (problem stated first with evidence, specific scope naming entities and exclusions, verifiable success criteria, no implementation HOW, a named JTBD persona+job from `JTBD.md`). Judge rubric: the spec addresses the brief, not just structural compliance. Pass = structural and judge verdicts both pass. |
| Task: `kata-plan/decompose-design` | Agent input: a frozen `spec.md` + `design-a.md` taken from a real merged spec. Agent output: a `plan-a.md`. Structural rubric: grades against the quality bar `kata-plan` itself publishes (step headings, named file paths, an Approach section and a Risks section, dependency-respecting ordering against the input design). Judge rubric: ordering and risks are non-trivial against the input design. Pass = structural and judge verdicts both pass. |
| Task: `kata-review/grade-spec` | Agent input: a frozen fixture spec carrying a fixed count of planted flaws. Agent output: a `review.md`. Structural rubric: grades against the quality bar `kata-review` itself publishes (severity grouping, file+line citation, criterion+reason shape), and asserts that every planted flaw is caught with a citation within an allowed tolerance band of the canonical fixture location. The flaw count, the canonical citation per flaw, and the tolerance are checked-in artefacts of the fixture. Judge rubric: no spurious blocker findings against unflawed sections. Pass = structural and judge verdicts both pass. |
| Fixture safety property | Every planted-flaw artefact and every fixture input checked into either family is unambiguously machine-skippable as a fixture without parsing the artefact body, so downstream agents crawling the repo do not consume them as real artefacts. The specific marker mechanism (front-matter token, directory marker file, path-shape convention, or any combination) and the location at which it is asserted are design choices, consistent with the verification surface in Success Criteria. |
| Workflow triggers | A dedicated GitHub Actions workflow runs both families. It fires on three signals: manual dispatch (for cost control); a weekly schedule on `main`; and pull-request paths-filter scoped to changes that could affect benchmark outcomes (kata-skill sources and the benchmark family trees). Concurrency on the same PR ref cancels in-progress runs. |
| Pin vs. in-repo regime | The scheduled job pins both family lockfiles at fixed `kata-skills` versions so history is comparable across time. The path-filtered PR job stages the "with-kata" family from the **in-repo** `.claude/skills/kata-*` sources (and a corresponding lockfile derived from those sources) so the change under review is what gets graded — not the previously-published `latest`, which would not yet contain the PR's edits since `kata-skills` publishes only on push to `main`. The "without-kata" family stays pinned in both regimes (its content is fixed by the minimum-viable-skill-set definition). Each result record carries an explicit regime tag in addition to `skillSetHash`, so the two regimes are distinguishable from the record alone — including when an in-repo build happens to hash-equal a pinned baseline. |
| Cost envelope | Every workflow invocation runs the v1 task set inside a fixed cost envelope: a single pinned cheap model, a fixed run count per task, and a fixed max-turn cap per session. The envelope target is ≤ $5 per workflow invocation **measured as the median over a small sample of consecutive invocations** (so a single high-variance run does not dominate the verdict), summing the `costUsd` field already on every result record. The specific configuration values, the sample size, and the surface at which they are declared are design choices; the spec asserts the envelope target, the measurement rule, and the recording substrate. |
| Ablation reporting | A reporting capability consumes both families' result records from a single workflow run and emits a per-task pass@k delta table. The table is written to the GitHub Actions job summary and uploaded as a workflow artefact. The headline metric is `pass@1(with) − pass@1(without)`. |
| Reporting bar | The job summary surfaces a "skill-positive" label when the per-task pass@1 delta clears a configurable threshold on a configurable majority of v1 tasks. The threshold is documented as a value on the pass@1 lattice at the configured run count (so it is reachable, not aspirational), and is surfaced — not enforced. Merge decisions on kata-skill PRs remain reviewer judgement; the JSONL artefact is the substrate. |
| Documentation | The benchmarks catalog README documents the per-family layout and how to add a new family. Each kata-skills family's README documents the family-local conventions and links to spec #870 for the substrate-level operational notes (skill-pack staging, sandbox flags, agent-cwd discipline, judge-profile-only-for-v1). The substrate notes are not re-enumerated in this spec or in either family README. |

### Out of scope, deferred

- **Tasks for other kata skills.** v1 ships three tasks; the remaining
  `kata-*` skills are deferred to a follow-up spec once the v1 grading
  approach is validated.
- **Other skill packs.** The directory layout under `benchmarks/` admits more
  families. A family targeting the `fit-*` pack would evaluate library-CLI
  competence rather than agent-team artefacts and is a separate spec.
- **Cross-model comparison.** The result schema already carries `model`;
  rendering a Sonnet-vs-Haiku comparison is a separate report mode.
- **A leaderboard or XmR control chart of pass@k over time.** The JSONL
  artefact is the substrate; visualisation comes later.
- **Hard CI gating on the reporting bar.** v1 surfaces the delta to
  reviewers. Promoting the bar to a merge gate requires enough history to
  calibrate the threshold against noise, which is a follow-up decision.
- **Per-task agent profile.** v1 leaves the harness's agent-profile selector
  unset so behaviour comes from the skill alone. Mixing in a kata agent
  profile is a separate experiment.
- **Grading-only mode.** v1 always runs the agent end-to-end.
- **Replay from trace.** Each run is a fresh agent session.
- **Container isolation.** Inherited from spec #870 — out of scope here too.

## Success Criteria

| Claim | Verification |
|---|---|
| The benchmarks root hosts two sibling families that the harness loads independently. | Test: `fit-benchmark run --family benchmarks/<with-kata-family>` and `fit-benchmark run --family benchmarks/<without-kata-family>` each load successfully; each family's task pre-flight passes for all three v1 tasks. |
| The two families produce different `skillSetHash` values. | Test: a benchmark run against the with-kata family and a benchmark run against the without-kata family, on the same task, produce result records with different `skillSetHash` values; a one-byte change to either family's `apm.lock.yaml` changes that family's `skillSetHash`. |
| The without-kata family is operationally minimal. | Test: the without-kata family's `.claude/skills/` is empty; its `.claude/agents/` contains exactly the judge profile the workflow invokes (so the harness's judge-profile pre-flight check passes); its `apm.lock.yaml` declares no `kata-*` packages; the family's per-task pre-flight passes for every v1 task. |
| v1 ships exactly three tasks and they exercise the named skills. | Test: each sibling family's `tasks/` tree contains exactly `kata-spec/write-feature-spec`, `kata-plan/decompose-design`, and `kata-review/grade-spec`; the two trees are content-identical. |
| Each task carries the inputs the agent needs and a hidden grading material that scores the agent's artefact against the skill's own contract. | Test: for each v1 task, the task's instructions reference its task-local input set; the task's grading material lives outside the agent's working directory per spec #870's hidden-grading contract and asserts the rubric named for that task in the In-scope table. |
| The `kata-review/grade-spec` fixture is internally consistent. | Test: the fixture carries a checked-in flaw manifest naming the count of planted flaws, the canonical citation per flaw, and the tolerance band; the grading material reads the manifest and pass/fail is reproducible across runs of the same fixture content. |
| Every fixture artefact is machine-skippable without parsing its body. | Test: a downstream consumer that walks the repo and applies the chosen marker mechanism does not see any planted-flaw artefact's body; the mechanism is documented in the family README and applies to every fixture under either family. |
| Result records carry an explicit pin-vs-in-repo regime tag. | Test: the harness's result-record schema (owned by spec #870) is extended to carry the regime in effect for the run; a scheduled-job invocation writes records tagged `pinned` and a PR-job invocation writes records tagged `in-repo`, distinguishable from the record alone without reference to history. The schema extension is an in-scope change to the substrate library and is committed together with this family. |
| The workflow fires on the three documented signals and bounds spend. | Test: the workflow file declares a manual dispatch trigger, a weekly schedule on `main`, and a pull-request trigger paths-filtered to changes that could affect benchmark outcomes (kata-skill sources and the benchmark family trees); the workflow declares per-PR-ref concurrency that cancels in-progress runs. |
| Scheduled and PR runs use different staging regimes. | Test: the scheduled job resolves both family lockfiles to fixed versions; the PR job stages the with-kata family from the in-repo `.claude/skills/kata-*` sources and derives its lockfile from that staged tree; the without-kata family stays pinned in both regimes; the regime tag on each record reflects which path was taken. |
| The cost envelope is asserted at the invocation site and measured from result records. | Test: the workflow pins a single model, a fixed run count, and a fixed max-turn cap at the invocation site; the median sum of `costUsd` across the workflow's configured small sample of consecutive v1 invocations is ≤ $5. |
| Ablation reporting emits a pass@k delta table from the two arms. | Test: given the with-kata and without-kata result-record sets on the v1 task set, the reporting capability writes a markdown table to the GitHub Actions job summary listing per-task `pass@1(with)`, `pass@1(without)`, and the delta; the same table is uploaded as a workflow artefact. |
| The reporting bar is on the pass@1 lattice and is surfaced, not enforced. | Test: the configured threshold is a value reachable as a difference of two `pass@1` values at the configured run count (so the bar is mathematically attainable); when the threshold is cleared on the configured majority of v1 tasks, the job summary marks the run "skill-positive"; the workflow exit status depends only on harness and schema outcomes, not on the bar. |
| Documentation cites substrate operational notes rather than repeating them. | Test: the benchmarks catalog README and each family's README link to spec #870 for substrate-level operational guidance and do not re-enumerate those notes inline. |

— Product Manager 🌱

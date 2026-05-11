# Spec 890 — Kata-Skills Benchmark Family with Ablation Methodology

## Problem

The monorepo publishes `forwardimpact/kata-skills` (the `kata-*` skill pack)
and tells external users that installing it makes their agent teams better at
agent-team work — writing specs, designing, planning, reviewing, releasing.
Today that claim is taken on faith. There is no reproducible measurement of
whether the pack changes outcomes, and no way to detect a regression when a
skill is edited.

Spec [#870](../870-fit-benchmark-coding-tasks/spec.md) (merged in commit
7dc453bb) shipped `fit-benchmark`: a harness with a task-family layout, hidden
grading, judge phase, `skillSetHash` per result record, and pass@k aggregation
across runs. That harness is plumbing. The toy `tf/{pass,fail,…}` fixtures it
ships only exercise the harness's own contracts — they do not say anything
about whether the `kata-*` pack works.

Three structural gaps remain between the harness and a defensible claim about
the kata pack:

1. **No task family targets the kata pack.** The kata skills do not write code
   — they write artefacts (specs, designs, plans, review findings) and enforce
   process (READ-DO/DO-CONFIRM checklists, severity-tagged findings, panel
   reviews). The harness's three grading surfaces (running-service, repo
   state, process exit) support artefact grading, but no concrete tasks
   exercise the kata skills against them.

2. **No ablation contrast.** Even a passing run of "with kata skills installed"
   is uninterpretable on its own: a sufficiently capable model passes some
   tasks without any skill pack. The claim "the skills moved the needle"
   requires a paired run with the skills absent, and a result record format
   that makes the contrast self-auditable.

3. **No operational cadence.** A measurement nobody runs is a measurement
   nobody trusts. Without a scheduled job on `main` (regression detection
   across time) and a path-filtered PR job (skill changes get graded as they
   land), drift goes unnoticed until users complain.

The blast radius of the gap is the JTBD this work serves: Platform Builders
cannot prove whether a kata-skill change improved agent-team outcomes. Kata
skill PRs ship on reviewer impressions, identical to the pre-`fit-benchmark`
state for coding skills.

## Personas and Job

The primary persona is **Platform Builders**, hired against the Big Hire
"Help me prove whether agent changes improved outcomes with reproducible
evidence" ([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve
Agents). This is the same job spec #870 serves; this spec exercises that
harness on a real published pack rather than toy fixtures.

A secondary persona is **Teams Using Agents**, the Kata product's external
audience. They inherit the benefit downstream — Kata can prove its own claim
when evaluating whether to adopt the pack — but they are not the direct hire
and the work does not change anything they consume.

End users running agents in production are not in scope.

## Scope

### In scope

| Component | What changes |
|---|---|
| Benchmark family root | A new top-level `benchmarks/` directory hosts task families per skill pack. The directory carries a catalog README that explains the family structure and how to add a new family. |
| `kata-skills` family | The first family under `benchmarks/`. Targets the `forwardimpact/kata-skills` pack. Carries a family README documenting the build-time materialisation conventions surfaced during the manual e2e of spec #870 (APM `.agents/` → `.claude/` translation; `IS_SANDBOX=1` for non-root containers; explicit relative-path discipline in instructions; no `--agent-profile` for v1). |
| v1 task set | Three tasks, each targeting one kata skill whose contract is concrete enough to grade structurally. Scope is fixed at three; expansion is deferred to v2. |
| Task: `kata-spec/write-feature-spec` | Agent input: a brief problem statement plus a reference to a JTBD persona+job. Agent output: a `spec.md` at a prescribed path. Structural rubric: required sections present (`## Problem`, `## Personas and Job`, `## Scope` with `### In scope` and `### Out of scope`, `## Success Criteria`); the criteria table has ≥3 rows with a Verification column; the spec cites a named JTBD persona+job from `JTBD.md`. Judge rubric: the spec addresses the brief, not just structural compliance. Pass = structural AND judge verdicts pass. |
| Task: `kata-plan/decompose-design` | Agent input: an existing `spec.md` plus `design-a.md` taken from a real merged spec. Agent output: a `plan-a.md`. Structural rubric: ≥3 numbered `## Step N —` headings; each step names ≥1 file path; `## Approach` and `## Risks` sections present; every component named in the design is mentioned by file path. Judge rubric: plan ordering respects dependencies; risks are non-trivial. Pass = structural AND judge verdicts pass. |
| Task: `kata-review/grade-spec` | Agent input: a spec carrying **planted flaws** (vague success criteria, scope creep, missing JTBD link). Agent output: a `review.md`. Structural rubric: findings grouped under `### Blocker`/`### High`/`### Medium`/`### Low`; each row shaped `<file:line> — <criterion> — <reason>`; every planted flaw caught with the correct `file:line`. Judge rubric: no spurious blocker findings against unflawed sections. Pass = structural AND judge verdicts pass. |
| Ablation manifests | The family carries two checked-in skill-set manifests: a "with-kata" manifest that materialises the live `forwardimpact/kata-skills` pack into the per-task `.claude/` layout, and a "no-kata" manifest that materialises an empty skill set sufficient for the harness's pre-flight to pass. Manifest contents uniquely identify the skill set per spec #870's contract; the harness's `skillSetHash` on each result record differs between the two arms, so the JSONL artefact is self-auditing. |
| Fixture safety convention | Every planted-flaw artefact under `benchmarks/kata-skills/tasks/` carries a `BENCHMARK_FIXTURE_DO_NOT_USE` front-matter marker and a top-of-file warning paragraph. Each `tasks/*/specs/` directory carries a `.benchmark-fixture` marker file at its root, allowing scrapers and crawlers to skip the whole subtree without parsing front matter. |
| Workflow triggers | A dedicated GitHub Actions workflow runs the family. It triggers on three signals: `workflow_dispatch` (manual, for cost control); a weekly `schedule` on `main`; and `pull_request` paths-filtered on `.claude/skills/kata-*/**` and `benchmarks/kata-skills/**`. Concurrency cancels in-progress runs on the same PR branch to bound spend. |
| Pin vs. latest manifest policy | The scheduled job pins both manifests at fixed `kata-skills` versions so history is comparable across time. The path-filtered PR job pulls `latest` so the change under review is what gets graded. Both regimes are distinguishable after the fact via `skillSetHash` on the result record. |
| Cost cap | Every workflow invocation runs each task at a fixed run count (`N=5`), against a fixed cheap model (`claude-haiku-4-5-20251001`), with a fixed max turn count (`20`). The configured envelope keeps the cost per invocation ≤ $5. |
| Ablation reporting | A reporting capability consumes the two arms' result records and emits a pass@k delta table. The table is written to the GitHub Actions job summary and uploaded as a workflow artefact. The headline metric is `pass@1(with) − pass@1(without)`. |
| Reporting bar | The job summary calls a run "skill-positive" when `pass@1(with) − pass@1(without) ≥ 0.3` on at least 2 of 3 tasks at `runs=5`. The bar is informational only — surfaced to reviewers, not enforced by CI. Merge decisions on kata-skill PRs remain reviewer judgement; the JSONL artefact is the substrate. |
| Documentation | The benchmarks catalog README documents the family layout and how to add a new family. The kata-skills family README documents the v1 task set, the ablation methodology, the fixture-safety convention, and the cost envelope. No published-skill changes are in scope — the family is internal infrastructure. |

### Out of scope, deferred

- **Tasks for other kata skills.** v1 ships three tasks. `kata-implement`,
  `kata-release-cut`, `kata-release-merge`, `kata-security-update`,
  `kata-product-issue`, `kata-pattern-synthesis`, `kata-session`,
  `kata-wiki-curate`, `kata-documentation`, `kata-security-audit`,
  `kata-setup`, and `kata-interview` each get a dedicated task in v2 once the
  v1 grading approach is validated on the three artefact-shaped skills above.
- **A `benchmarks/fit-skills/` family.** The directory layout under
  `benchmarks/` admits more families; only `kata-skills` is in scope here. A
  `fit-skills` family would evaluate library-CLI competence rather than
  agent-team artefacts and is a separate spec.
- **Cross-model comparison.** The result schema already carries `model`;
  rendering a sonnet-vs-haiku comparison is a separate report mode.
- **A leaderboard or XmR control chart of pass@k over time.** The JSONL
  artefact is the substrate; visualisation comes later.
- **Hard CI gating on the reporting bar.** v1 surfaces the delta to reviewers
  in the job summary. Promoting the bar to a merge gate requires enough
  history to know what `0.3` means under noise; that is a v2 decision.
- **Per-task agent profile.** v1 leaves the harness's `--agent-profile`
  unset so behaviour comes from the skill alone. Mixing in a kata agent
  profile is a separate experiment.
- **A grading-only mode that scores existing artefacts without running an
  agent.** v1 always runs the agent end-to-end.
- **Replaying graded runs from trace.** Each run is a fresh agent session.

## Success Criteria

| Claim | Verification |
|---|---|
| The family is laid out as a `fit-benchmark` task family with v1's three tasks present. | Test: `npx fit-benchmark list --family benchmarks/kata-skills` enumerates exactly `kata-spec/write-feature-spec`, `kata-plan/decompose-design`, and `kata-review/grade-spec`; the family's pre-flight passes for all three. |
| Each v1 task carries the inputs the agent needs and a hidden grading material that scores the agent's artefact. | Test: each task's instructions reference its task-local input set; each task's grading material lives outside the agent's working directory per spec #870's hidden-grading contract and asserts the structural rubric named for that task in the In-scope table. |
| The ablation manifests materialise into two skill sets that pre-flight differently. | Test: building the "with-kata" manifest stages a non-empty `.claude/skills/` containing the `kata-*` pack; building the "no-kata" manifest stages an empty `.claude/skills/` with the minimum scaffolding required for pre-flight to pass; both manifests pass `fit-benchmark` pre-flight. |
| Result records distinguish the two arms. | Test: a run against the "with-kata" manifest and a run against the "no-kata" manifest, on the same task, produce result records with different `skillSetHash` values; a one-byte change to either manifest changes its `skillSetHash`. |
| Every planted-flaw fixture is marked unsafe for downstream consumption. | Test: every artefact under `benchmarks/kata-skills/tasks/*/specs/` carrying planted flaws contains the `BENCHMARK_FIXTURE_DO_NOT_USE` front-matter marker and a top-of-file warning paragraph; every `tasks/*/specs/` directory carries a `.benchmark-fixture` marker file at its root. |
| The workflow runs both arms at the fixed run count and writes both arms' result records. | Test: a workflow invocation against the v1 task set produces two run-output trees (one per arm), each containing `tasks × N` result records, all validating against the schema from spec #870. |
| The workflow triggers fire on the three documented signals. | Test: the workflow file declares `workflow_dispatch`, a weekly cron `schedule`, and a `pull_request` trigger paths-filtered on `.claude/skills/kata-*/**` and `benchmarks/kata-skills/**`; concurrency cancels in-progress runs on the same PR branch. |
| Scheduled and PR runs use different manifest-pinning regimes. | Test: the scheduled job resolves both manifests to fixed versions; the PR job resolves the "with-kata" manifest to `latest`; the regime in effect for a given run is recorded on the result record (via `skillSetHash` differing from the pinned baseline when `latest` has moved). |
| Cost envelope is enforced by configuration, not convention. | Test: the workflow pins `--runs 5`, `--model claude-haiku-4-5-20251001`, and `--max-turns 20` at the invocation site; a single end-to-end invocation against the v1 task set completes within the ≤$5 per-run budget. |
| Ablation reporting emits a pass@k delta table. | Test: given the two arms' result records on the v1 task set, the reporting capability writes a markdown table to the GitHub Actions job summary listing per-task `pass@1(with)`, `pass@1(without)`, and the delta; the same table is uploaded as a workflow artefact. |
| The reporting bar is surfaced, not enforced. | Test: when `pass@1(with) − pass@1(without) ≥ 0.3` on at least 2 of 3 tasks, the job summary marks the run "skill-positive"; the workflow exit status is not affected by the bar — only by harness or schema failures. |
| The family README documents the manual-e2e gotchas. | Test: `benchmarks/kata-skills/README.md` covers APM `.agents/` → `.claude/` translation, the `IS_SANDBOX=1` requirement for non-root containers, the relative-path discipline expected of instructions, and the rationale for leaving `--agent-profile` unset in v1. |

— Product Manager 🌱

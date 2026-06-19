# Plan 2090-b: Work-Item Tracker Abstraction

Implements [design-b.md](design-b.md), the variant selected for planning when
that design merged ([PR #1785](https://github.com/forwardimpact/monorepo/pull/1785)).
It is lettered **b** to mirror its design; it is the plan to implement for spec
2090. [design-a.md](design-a.md) (the `kata-coordinate` skill) stays on record as
the rejected alternative. Spec, criteria, and exclusions: [spec.md](spec.md).

## Approach

Build the tracker matrix as one new agent reference, re-point every in-scope
tracker call-site at the abstract operation it now names, wire `--work-tracker`
into the libeval harness the way `--agent-profile` is already wired, and add an
offline coordination benchmark task that the harness drives under the filesystem
tracker. The publish workflow, genericity gate, and `self-improvement.md`
genericization that design-b also names are **already on `main`** (they merged
inside the design PR — `git show 9dfd22a --stat`); this plan builds on them and
verifies they stay green rather than reapplying them.

## Already landed (do not redo; verify)

| Surface | State on `main` | This plan's obligation |
| --- | --- | --- |
| `.github/workflows/publish-skills.yml` | Ships `.claude/agents/references/**` in the kata pack's *Sync agents* step | New `work-trackers.md` lands under that tree, so it publishes automatically — no workflow edit |
| `.coaligned/invariants/skill-genericity.rules.mjs` | Scope covers `.claude/agents/references/**`; stale `agents/` link ban removed | All new/edited reference + skill content must pass this gate (Cross-cutting § Genericity) |
| `.claude/agents/references/self-improvement.md` | `bunx`→`npx` | None |

## Cross-cutting

### Scope boundary (the criterion-2 set)

Criterion 2 is a mechanical grep. Parts 01–03 are correct only against one fixed
definition of "commands that act on a tracker's work item". This table is that
definition; every part references it rather than re-deriving it.

| Class | In scope — relocate to matrix github column | Out of scope — stays in place |
| --- | --- | --- |
| `gh issue *` | all (create, list, view, comment, close, edit/label) | — |
| `gh pr *` | all (create, view, list, comment, merge, close, checks, diff, review) | — |
| `gh api` | `.../issues*`, `.../pulls*`, `graphql` discussion mutations (`addDiscussion*`) | `.../commits*` (SHA verification), `.../tags`, `.../actions`, secrets |
| `gh` other | `gh label *`, `gh ... review` | `gh secret *`, `gh workflow run`, `gh run *` (CI-run introspection) |
| remote git | change materialization: `git switch -c` / `git checkout -b` of a change branch + `git push`/`--force-with-lease` of that branch | `git fetch origin main` (canonical-state/STATUS read), `git push origin <tag>` (release), `git push … HEAD:master` (wiki memory) |

**Excluded surface — `kata-setup`.** `kata-setup` provisions the GitHub tracker
itself (App, secrets, dispatch reactor, workflow files); its embedded `gh api`
calls — including the `addDiscussionComment` graphql in generated reactor YAML —
are the github tracker's own wiring, not portable coordination an agent performs.
There is no filesystem-tracker equivalent to provision. The matrix's github
column **names** the dispatch bridge (citing `kata-setup`) rather than relocating
the generated YAML into the matrix. The criterion-2 verification grep therefore
runs over the kata-* skills and shared references **excluding `kata-setup/`** and
`citation-integrity.md` (commit verification). This boundary is the plan's main
judgment call — see Risks.

### Operation vocabulary

The matrix (Part 01) defines these; every other part may only use these names.
`create-issue`, `list` (issues or changes), `read` (one item), `comment`,
`label`, `link`, `open-change`, `update-change`, `gate`, `merge-change`, `close`,
`create-discussion`, `comment-discussion`. `triage` = label + comment + close;
`patch` = open-change + merge-change (compositions, not operations). `read` and
`list` cover the metric-grade tracker queries (`gh pr list`, `gh pr view/diff`,
`gh issue view`); their rich github realizations live in the matrix and degrade
on filesystem to front-matter globs.

### Active-tracker resolution

Skills never branch on the tracker. The matrix instructs the agent to read the
active column from `$LIBEVAL_WORK_TRACKER` (default `github`) and realize each
operation through that column. The harness (Part 04) sets that env var; the agent
resolves the column.

### Genericity

New and edited pack content (`work-trackers.md`, the three references,
`issue-lifecycle.md`, the kata-* skills) must pass
`.coaligned/invariants/skill-genericity.rules.mjs`: no `bunx`/`bun run`/`just`,
no `@forwardimpact/…`, no hardcoded dates or `repos/forwardimpact/monorepo`, no
monorepo issue/PR links. Use placeholder forms (`repos/{owner}/{repo}`,
`{YYYY}`). Cross-pack links use `../../agents/references/work-trackers.md` from a
skill (resolves identically in monorepo and pack) and `work-trackers.md` from a
sibling reference.

## Parts

| Part | Scope | Depends on |
| --- | --- | --- |
| [01](plan-b-01.md) | New `work-trackers.md`: model, operations, github + filesystem columns, selection, degradation | — |
| [02](plan-b-02.md) | Re-point `work-definition.md`, `coordination-protocol.md`, `approval-signals.md`, `issue-lifecycle.md` | 01 |
| [03](plan-b-03.md) | Re-point the kata-* skills and their references (incl. metrics reads) | 01 |
| [04](plan-b-04.md) | libeval `--work-tracker` / `LIBEVAL_WORK_TRACKER` on `fit-eval` + `fit-benchmark` | — |
| [05](plan-b-05.md) | `coordinate-finding` benchmark task | 01, 04 |

## Execution

Route every part to an engineering agent (`staff-engineer`); the re-pointing is
coordination-semantics work, not docs-site prose, so not `technical-writer`.
Part 01 runs first and alone — it is the citation target for 02, 03, 05. Once 01
lands, **02, 03, and 04 run in parallel** (disjoint files). **05 runs last**, after
01 (operation names) and 04 (the `--work-tracker` flag it is invoked with). Run
`bun run check` and `bun run test` after each part; run `bun run check-skill-refs`
after 01–03.

## Risks

- **Criterion-2 boundary is a judgment call.** The Scope-boundary table excludes
  `kata-setup` and `citation-integrity.md`. If the approver wants the
  `kata-setup` discussion-reply relocated, Part 03 and the matrix grow and the
  generated-reactor YAML needs a github-only carve-out. Confirm the boundary at
  approval.
- **Benchmark runs the whole family under `--work-tracker filesystem`.** The
  rubric tasks (spec/design/plan/implement) must be inert under it. They never
  read `LIBEVAL_WORK_TRACKER`, so they are — verify no rubric task or its hooks
  reference the var (Part 05).
- **Matrix link resolution under `check-skill-refs`.** The lint runs in the
  publish workflow against the pack layout. `../../agents/references/…` resolves
  there, but verify with `bun run check-skill-refs` before push (Parts 01, 03).
- **Read/metric operations carry github-only richness.** `gh pr list --json …`
  field sets have no filesystem analogue; the matrix must state the degradation
  (front-matter globs return a reduced field set) so criterion 5 holds.

Libraries used: none (this overview).

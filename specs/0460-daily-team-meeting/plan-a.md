# Plan 0460-A — Kata Coaching System

## Approach

The spec introduces four interdependent additions: metrics infrastructure,
coaching protocol, coach/learner role realignment, and holistic skill
integration. The design decomposes these into six components. This plan
sequences them into four independently-committable parts that respect
dependencies while maximizing parallelism.

**Sequencing rationale:** Metrics infrastructure (Part 01) must land first — the
storyboard skill reads metrics CSVs, and skill integration adds metric recording
steps referencing the kata-metrics protocol. Once Part 01 exists, Parts 02–04
are independent of each other: the storyboard skill (Part 02) references
kata-metrics but does not depend on the skill integration edits; the skill
integration (Part 03) adds metrics.md references and memory bullets to 14
skills; and the infrastructure changes (Part 04) wire workflows, profiles, and
documentation.

```text
Part 01: kata-metrics skill (utility)
   ↓
Part 02: kata-storyboard skill (coaching protocol)  ─┐
Part 03: Skill integration (14 entry-point skills)   ├── independent after 01
Part 04: Profiles, workflows, documentation          ─┘
```

Part 04 depends on Parts 02 and 03 conceptually (it wires the storyboard and
metrics into profiles/workflows/docs), so it should run last. Parts 02 and 03
can run concurrently after Part 01.

## Cross-cutting concerns

- **One code change.** This spec is almost entirely instructional content (.md,
  .yml). The sole exception: `fit-eval facilitate` currently enforces `--agents`
  must have at least 2 entries (`facilitate.js:52`), but the coaching-session
  workflow needs 1-on-1 mode (1 agent + facilitator). Part 04 relaxes this
  validation to `>= 1`. All other changes are skill files, agent profiles,
  workflow YAML, and documentation. `bun run check` and `bun run test` must
  pass.
- **Formatting.** All markdown files must pass `bun run check` (prettier). Run
  check before committing each part.
- **SKILL.md line budget.** Per KATA.md § Skill structure, aim for ~200 lines or
  fewer per SKILL.md. Supporting material goes into `references/`.
- **Consistent wording.** Per KATA.md § Shared patterns, use identical phrasing
  for the metrics recording bullet across all 14 skills.

## Part index

| Part | Summary                                      | Files | Depends on |
| ---- | -------------------------------------------- | ----- | ---------- |
| 01   | kata-metrics utility skill                   | 3     | —          |
| 02   | kata-storyboard entry-point skill            | 3     | 01         |
| 03   | Skill integration (14 metrics.md + 14 edits) | 28    | 01         |
| 04   | Profiles, workflows, documentation           | 12    | 01, 02, 03 |

## Libraries used

No shared `@forwardimpact/lib*` packages are consumed. This spec is purely
instructional content (skills, profiles, workflows, documentation).

## Risks

1. **kata-action facilitate mode gap.** The composite action currently supports
   only `run` and `supervise` modes. Part 04 adds `facilitate` mode: two new
   inputs, a new shell branch, a new trace split step, modified artifact upload
   conditions, and two new upload steps — five coordinated changes to a shared
   composite action used by all agent workflows. **Mitigation:** The facilitate
   branch is additive — the `run` and `supervise` branches are untouched.
   Existing workflows pass `mode: "run"` or omit mode (default `"run"`), so they
   never enter the new branch. Any YAML syntax error would still break the
   action file for all consumers, so validate YAML before committing.

2. **fit-eval facilitate minimum agents.** `fit-eval facilitate` enforces
   `--agents` must have at least 2 entries (`facilitate.js:52`). The
   coaching-session workflow passes only 1 agent. Part 04 includes a one-line
   code change to relax this validation to `>= 1`. Risk is low — the facilitator
   is always a separate session from the agents, so 1 agent + 1 facilitator is a
   valid configuration.

3. **Facilitate trace splitting.** The current trace split step handles
   `supervise` mode only (2 participants: agent + supervisor). Facilitate mode
   has N+1 participants. Part 04 splits traces per participant name (not just
   facilitator vs. all-agents) so each domain agent can analyze its own trace
   during 1-on-1 coaching. **Mitigation:** fit-eval writes a unified NDJSON
   trace with `.source` fields per participant. The split step uses `jq` to
   extract per-source traces, following the same pattern as the supervise split.

4. **14-skill blast radius.** Part 03 edits all 14 entry-point SKILL.md files. A
   typo in the shared metrics bullet would propagate to all 14. **Mitigation:**
   Use identical wording from a template, and run `bun run check` after all
   edits.

5. **Storyboard skill length.** The coaching protocol (five questions × two
   modes + 1-on-1 coaching) may exceed the ~200 line SKILL.md budget.
   **Mitigation:** Move the storyboard template and detailed protocol into
   `references/` — SKILL.md holds only the routing logic and checklists.

## Execution

- **Part 01** → `staff-engineer` (sequential prerequisite)
- **Parts 02 + 03** → two `staff-engineer` sub-agents in parallel after Part 01
  merges
- **Part 04** → `staff-engineer` after Parts 02 + 03 complete

All four parts are instructional content (skills, profiles, workflows, docs).
`staff-engineer` owns all parts because: KATA.md and wiki/MEMORY.md are
operational infrastructure docs (not user-facing website/ content), and all
skill/profile/workflow changes require understanding the kata architecture.
`technical-writer` owns `website/` pages and wiki curation — neither applies
here. The KATA.md and MEMORY.md changes are small additive sections describing
new infrastructure, not documentation rewrites.

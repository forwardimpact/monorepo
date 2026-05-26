# Plan A — Remove stages from the engineering pathway

## Approach

Stages are woven through four layers: framework data/schema, core library
(libskill), product code (map + pathway), and the synthetic data pipeline. The
plan removes stages bottom-up: data schema first, then library, then products,
then synthetic pipeline, then documentation. This ordering ensures each layer
compiles and tests after its changes, and avoids circular dependencies.

The plan is decomposed into five parts because the changes span independent
packages and the total scope is too large for a single implementation pass.
Parts 1-3 must execute sequentially (schema → library → products). Part 4
(synthetic pipeline) depends on part 1 (vocabulary removal) but is independent
of parts 2-3. Part 5 (documentation) is independent of all others.

### Key design decisions

1. **New agent naming: `{kebab(roleTitle)}--{track}`**. The spec defines this
   pattern. The `--` double-hyphen separates discipline from track. This is
   valid for agent profile names (regex `[a-zA-Z0-9._-]+`) but would fail
   `validateAgentSkill`'s consecutive-hyphen check — however agent names are
   profile names, not skill names, so no conflict.

2. **New `generateAgentProfile` replaces `generateStageAgentProfile`**. The new
   function produces one profile per discipline (x track) instead of one per
   discipline x track x stage. It includes the full skill matrix without stage
   filtering, and checklists come from flat
   `agent.{focus, readChecklist, confirmChecklist}` per skill.

3. **`generateSkillMarkdown` simplified**. Currently iterates
   `agent.stages[stageId]` to build a stages array. After removal, it reads
   `agent.{focus, readChecklist, confirmChecklist}` directly — no stages array,
   no stage comparator, no handoff lookup.

4. **Checklist derivation removed entirely**. `deriveChecklist` and
   `deriveAllChecklists` exist solely to aggregate stage-keyed checklists. The
   new flat structure makes these unnecessary — checklists are directly on each
   skill's agent section and rendered inline in skill markdown.

5. **Clean break — no backward compatibility**. As the spec mandates, no shims,
   no migration commands, no deprecation. `fit-map validate` rejects the old
   format.

## Part index

| Part | File                         | Summary                                                                                                  | Depends on |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| 01   | [plan-a-01.md](plan-a-01.md) | Map product: remove stage schema, validation, loading, rendering, starter data                           | —          |
| 02   | [plan-a-02.md](plan-a-02.md) | libskill: rewrite agent derivation, skill markdown, checklist, exports                                   | Part 01    |
| 03   | [plan-a-03.md](plan-a-03.md) | Pathway product + service: remove stage CLI, flags, pages, formatters, web UI, build-packs, gRPC service | Part 02    |
| 04   | [plan-a-04.md](plan-a-04.md) | Synthetic data pipeline: remove stage vocabulary, DSL parsing, prompts, rendering                        | Part 01    |
| 05   | [plan-a-05.md](plan-a-05.md) | Documentation: update CLAUDE.md domain concepts                                                          | —          |

## Risks

1. **Framework data migration** — Each skill's `agent.stages.*` blocks must be
   manually flattened to `agent.{focus, readChecklist, confirmChecklist}`.
   Consolidated checklists must comply with CHECKLISTS.md (5-9 items, READ-DO /
   DO-CONFIRM semantics). This is the most labor-intensive step and requires LLM
   assistance or manual authoring for quality consolidation.

2. **Agent template changes** — The Mustache template `agent.template.md` must
   be updated to remove stage sections (stageDescription, stageConstraints,
   stageTransitions, returnFormat) and the formatter must stop passing these
   fields. Template changes affect all downstream consumers.

3. **Build-packs digest stability** — Build-packs produce deterministic tar.gz
   archives. Changing from N agents per combination to 1 agent changes pack
   structure. External users consuming packs will get entirely new packs.

4. **`getStageOrder` in map/levels.js** — This function is exported from
   `@forwardimpact/map/levels` and re-exported through libskill policies. All
   consumers must be updated.

## Execution

**Sequential chain:** Part 01 → Part 02 → Part 03 (each depends on the prior).

**Parallel after Part 01:** Part 04 can start after Part 01 merges (needs
`STAGE_NAMES` removed from vocabulary, stage schema gone).

**Independent:** Part 05 can run at any time.

**Agent assignments:**

- Parts 01-04: `staff-engineer` — code and infrastructure changes
- Part 05: `technical-writer` — CLAUDE.md documentation update

**Recommended execution:**

1. `staff-engineer` executes Parts 01 → 02 → 03 sequentially on one branch
2. Once Part 01 is committed, launch `staff-engineer` for Part 04 in parallel
   (separate branch or sequential after Part 03 — either works)
3. Launch `technical-writer` for Part 05 in parallel at any point

# 480 — Rewrite Reference Lifecycle page after stages removal

**Status:** draft **Author:** Technical Writer **Created:** 2026-04-14

## Problem

Spec 0420 removed stages as a first-class entity from the pathway product, data
schema, and CLI. The Reference Lifecycle page
(`website/docs/reference/lifecycle/index.md`) was written when stages were
entities defined in `stages.yaml` with their own JSON schema. It describes:

1. **Six named stages as entities** with dedicated YAML definitions, handoffs,
   constraints, and checklists — `stages.yaml` and `stages.schema.json` no
   longer exist.

2. **Stage-specific agent generation** via `--stage` flag — the agent command no
   longer accepts `--stage` (spec 0420 removed it; confirmed
   `ERR_PARSE_ARGS_UNKNOWN_OPTION`).

3. **Checklist derivation from stage x skill matrix** — checklists are now flat
   fields within skill agent sections (`agent.focus`, `agent.readChecklist`,
   `agent.confirmChecklist`), not derived from a stage entity.

4. **Multi-agent workflows by lifecycle stage** — agents are now one per
   discipline x track, not one per discipline x track x stage.

The page's conceptual content (lifecycle phases, handoffs, constraints) still
has value. But the entity-based framing is structurally stale and will confuse
users who look for `stages.yaml` or `--stage` options.

All fit-pathway CLI options referenced in command handlers (`--level`,
`--maturity`, `--stats` on `questions`; `--skills`/`--tools` on `job`;
`--output` on `agent`) were verified as properly registered and functional in
`fit-pathway.js`. No phantom CLI option cleanup is needed — the only action is
rewriting the lifecycle page itself.

## Proposed solution

### Option A: Reframe as conceptual reference (recommended)

Rewrite the Lifecycle page to describe lifecycle phases as **conceptual
guidance** rather than **entity definitions**:

- Remove all references to `stages.yaml`, stage schemas, and stage entity YAML.
- Reframe handoffs, constraints, and checklists as conceptual workflow guidance
  embedded in skill agent sections.
- Update the "Stages and Agents" section to reflect one-agent-per-track model.
- Remove mermaid diagrams showing stage-specific agent handoffs.
- Cross-link to the Authoring Frameworks guide for how skills define checklists.

### Option B: Remove the page entirely

If lifecycle phases are no longer a user-facing concept post spec 0420, remove
the page and its card from the Reference index. Update cross-links from Core
Model and Agent Teams guides.

## Scope

- `website/docs/reference/lifecycle/index.md` — rewrite or remove
- `website/docs/reference/index.md` — update lifecycle card if reframing
- `website/docs/reference/model/index.md` — update lifecycle cross-link

## Success criteria

- No references to `stages.yaml`, stage schemas, `stages.schema.json`, or the
  `--stage` flag remain in `website/docs/reference/lifecycle/index.md` (or the
  file is removed entirely).
- No broken cross-links from Reference index, Core Model, or Authoring
  Frameworks pages to a removed or restructured lifecycle page.
- `bun run check` passes with no formatting or lint errors.

## Out of scope

- Spec 0420 implementation progress (separate spec, actively in progress)
- fit-landmark and fit-guide CLI Reference content (added in PR #368)
- Core Model levels table (fixed to J040/J060 in PR #368)

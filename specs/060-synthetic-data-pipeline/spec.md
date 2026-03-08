# Synthetic Data Pipeline

Replace all hand-crafted example content with a generation pipeline that
produces coherent, cross-referenced synthetic data for every product in the
monorepo.

```
specs/060-synthetic-data-pipeline/
  spec.md                       This document (WHAT and WHY)
  plan-01-claude-api.md         Claude API with validation loops
  plan-02-local-models.md       Local open-weight models (MLX / llama.cpp)
  plan-03-distilabel.md         Distilabel DAG pipeline with Argilla review
  plan-04-template-engine.md    Deterministic templates (no LLM)
  plan-05-hybrid-dsl.md         Custom DSL with tiered generation
```

## Why

The monorepo's example data is hand-crafted, incomplete, and incoherent across
products. This blocks three workflows:

1. **Evaluation.** Guide, Landmark, and Pathway cannot be evaluated end-to-end
   because no dataset spans all four content types with consistent entity
   references. A person in the org HTML may not exist in the activity tables;
   a skill in the framework YAML may have no corresponding evidence.

2. **Fine-tuning.** Basecamp skills and Guide's RAG pipeline need training data
   that reflects realistic organizational patterns — cross-team activity
   correlated with survey scores correlated with skill evidence. Hand-crafted
   data cannot encode these correlations at scale.

3. **Testing.** Products validate against example data (`npx fit-map validate`,
   E2E tests). Gaps in example data mean gaps in test coverage. Activity data
   and personal content have zero examples today.

The root cause is that four distinct content types — organizational, framework,
activity, and personal — are maintained independently with no shared entity
model or narrative context linking them.

## What

A pipeline that generates all example data from a single seed definition. The
seed declares the fictional organization, its people, projects, and story
scenarios. The pipeline produces four content types that are internally
consistent and cross-referenced.

### Content types

| Type             | Product(s)         | Format              | Current state          |
| ---------------- | ------------------ | ------------------- | ---------------------- |
| Organizational   | Guide              | HTML microdata      | Partial (hand-crafted) |
| Framework        | Map, Pathway       | YAML                | Partial (hand-crafted) |
| Activity         | Landmark           | JSON/CSV            | Missing                |
| Personal         | Basecamp           | Markdown            | Missing                |

### Seed data

A single declarative file defines the ground truth for all generated content:

- **Organization structure** — BioNova departments, teams, headcounts, and
  reporting hierarchy.
- **People** — 211 individuals with Greek mythology names, assigned to teams
  with discipline/level/track from defined distributions (L1: 40%, L2: 25%,
  L3: 20%, L4: 10%, L5: 5%).
- **Projects** — Named initiatives (drugs, platforms, programs) with team
  assignments and timelines.
- **Story scenarios** — 3–5 narrative arcs with defined time ranges, affected
  teams, and expected signal patterns.

The seed is the single source of truth. Every generated artifact must trace
back to it.

### Story scenarios

Scenarios encode causal narratives that drive correlated signals across content
types. Each scenario defines:

- A time range and affected teams.
- Expected GitHub activity patterns (spike, sustained high, declining).
- Expected DX survey score trajectories (rising sentiment, burnout signals).
- Expected skill evidence generation (which skills, minimum proficiency).

Minimum scenarios:

1. **Drug discovery push** — Clinical trial activity drives R&D GitHub commits
   and rising team sentiment.
2. **Major platform release** — Sustained commit spikes lead to burnout signals
   in DX surveys.
3. **Compliance remediation** — Post-audit upskilling generates evidence against
   compliance markers.
4. **Technology adoption wave** — New platform rollout drives gradual activity
   increases and tooling satisfaction.
5. **Cross-functional initiative** — Company-wide collaboration raises
   cross-team PR activity and connectedness scores.

### Output targets

| Content                        | Target location                          |
| ------------------------------ | ---------------------------------------- |
| Company narrative (README)     | `products/guide/examples/knowledge/`     |
| Entity registry (ONTOLOGY)     | `products/guide/examples/knowledge/`     |
| HTML microdata (22 files)      | `products/guide/examples/knowledge/`     |
| Framework YAML                 | `products/map/examples/`                 |
| Organization roster            | `products/map/examples/activity/`        |
| GitHub events and artifacts    | `products/map/examples/activity/`        |
| GetDX snapshots and scores     | `products/map/examples/activity/`        |
| Skill evidence                 | `products/map/examples/activity/`        |
| Personal knowledge base        | `products/basecamp/template/knowledge/`  |

### Cross-content validation

Generated data must pass these checks:

- Every person in the org HTML exists in the activity roster.
- Every person's discipline/level/track is a valid framework combination.
- Every `itemid` in HTML microdata resolves to an entity in the ONTOLOGY.
- GitHub activity per team correlates with scenario signal curves (r > 0.7).
- DX survey score trajectories correlate with scenario expectations (r > 0.6).
- Evidence proficiency levels meet or exceed scenario-defined floors.
- Self-assessment people exist in the organization.
- Basecamp entity references resolve to ONTOLOGY IRIs.
- All YAML passes `npx fit-map validate`.

### Clean break

The pipeline replaces — not supplements — existing hand-crafted content:

- `products/guide/examples/knowledge/` — All files (README.md, ONTOLOGY.md,
  HTML microdata, GENERATE.prompt.md) replaced by generated equivalents.
- `products/map/examples/` — All YAML files replaced by generated equivalents
  that pass the same schema validation.

Old content is deleted in the same commit that adds generated content. No
coexistence period.

## Scope

### In scope

- Seed data definition covering all entity types and relationships.
- Generation of all four content types from the seed.
- Story scenarios that drive correlated signals across content types.
- Cross-content validation suite.
- CLI interface for running the pipeline (`npx fit-map generate` or equivalent).
- Removal of all hand-crafted example content.

### Out of scope

- Modifying the existing JSON Schema or SHACL definitions (generated data must
  conform to current schemas).
- Modifying the `fit-map validate` logic (generated data must pass as-is).
- Generating data for production use (this is for development, evaluation, and
  testing only).
- Ingestion into Supabase (generated activity data lands as local files; the
  existing ingestion pipeline loads them).

## Constraints

- Generated YAML must pass `npx fit-map validate` without modification.
- Generated HTML must use valid schema.org microdata with `itemid` attributes
  matching the ONTOLOGY.
- Activity data must conform to the table schemas defined in the Map spec
  (see `activity.organization_people`, `activity.github_events`, etc.).
- The pipeline must be runnable from a single command.
- Output must be deterministic or reproducible (same seed → same structural
  output; prose may vary across LLM runs but must be cacheable).

## Alternative plans

Five plans explore fundamentally different approaches. Each is a complete,
self-contained document:

| Plan | Approach | LLM | Language | Key trade-off |
| ---- | -------- | --- | -------- | ------------- |
| [01](plan-01-claude-api.md) | Claude API with validation loops | Claude (remote) | Node.js | Highest prose quality; API cost and dependency |
| [02](plan-02-local-models.md) | Local models on Mac Studio M4 Max | Qwen3 (local) | Python | No API cost; hardware requirement and lower quality |
| [03](plan-03-distilabel.md) | Distilabel DAG pipeline | Any (pluggable) | Python | Production orchestration; Python dependency and framework coupling |
| [04](plan-04-template-engine.md) | Deterministic templates | None | Node.js | Instant, free, reproducible; formulaic prose |
| [05](plan-05-hybrid-dsl.md) | Custom DSL with tiered generation | Any (cached) | Node.js | Deterministic structure + LLM prose; custom parser maintenance |

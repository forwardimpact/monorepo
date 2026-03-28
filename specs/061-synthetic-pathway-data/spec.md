# Synthetic Pathway Data

Generate pathway data — the career framework entities validated by
`npx fit-map validate` — from the universe DSL via LLM-assisted content
generation. Output lands in `examples/pathway/` as schema-valid YAML.

```
specs/061-synthetic-pathway-data/
  spec.md       This document (WHAT and WHY)
  plan.md       Implementation plan (HOW)
```

## Why

libuniverse generates four content types from a single seed definition:
organizational (HTML), activity (JSON), personal (Markdown), and framework
(YAML). The framework tier is the weakest link — it emits three shallow files
(`self-assessments.yaml`, `roster.yaml`, `teams.yaml`) with hardcoded skill
names and no connection to the pathway schema that Map and Pathway actually
validate and consume.

This matters for three reasons:

1. **Schema mismatch.** The generated "framework" files do not conform to the
   pathway JSON schemas (`products/map/schema/json/`). They cannot pass
   `npx fit-map validate --data=examples/framework` because they are not pathway
   data at all — they are ad-hoc YAML with no schema reference. The real pathway
   data (`data/pathway/`) has 13 entity types with strict schemas; the generated
   data covers none of them.

2. **Language fidelity.** Pathway data is prose-heavy. Every skill has five
   proficiency descriptions. Every behaviour has five maturity descriptions.
   Capabilities carry responsibility narratives per level. Disciplines define
   role summaries for job descriptions. This prose must be coherent, consistent
   in tone, and domain-appropriate for the universe's industry — qualities that
   static templates cannot achieve. The installed instance (`data/pathway/`) was
   hand-authored over months; generating a second instance for a different
   domain (e.g., BioNova pharma) demands an LLM.

3. **Evaluation gap.** Without a second, independently-generated pathway
   dataset, there is no way to test that Map validation, Pathway rendering, and
   libskill derivation work with alternative data. The existing `data/pathway/`
   installation is both the only test fixture and the production data — a single
   point of failure for schema and derivation coverage.

### Original intent

The 060 spec defined the framework content type as "YAML for Map and Pathway"
and required it to pass `npx fit-map validate`. The initial libuniverse
implementation deferred this — it generates roster and assessment files that are
useful for activity correlation but do not constitute pathway data. This spec
closes that gap.

## What

Replace the `examples/framework/` output with `examples/pathway/` — a complete
pathway dataset generated from the universe DSL using LLM-assisted prose, valid
against the pathway JSON schemas.

### Entity inventory

The pathway schema defines 13 entity types. The generated dataset must include
all non-question types. Question generation is deferred (marked optional).

| Entity               | Schema file                        | File structure                     | LLM needed  |
| -------------------- | ---------------------------------- | ---------------------------------- | ----------- |
| Framework            | `framework.schema.json`            | `framework.yaml`                   | Yes (desc)  |
| Levels               | `levels.schema.json`               | `levels.yaml`                      | Yes (prose) |
| Stages               | `stages.schema.json`               | `stages.yaml`                      | Mostly no   |
| Drivers              | `drivers.schema.json`              | `drivers.yaml`                     | Yes         |
| Capabilities         | `capability.schema.json`           | `capabilities/{id}.yaml`           | Yes (heavy) |
| Behaviours           | `behaviour.schema.json`            | `behaviours/{id}.yaml`             | Yes (heavy) |
| Disciplines          | `discipline.schema.json`           | `disciplines/{id}.yaml`            | Yes         |
| Tracks               | `track.schema.json`                | `tracks/{id}.yaml`                 | Yes (mod)   |
| Self-assessments     | `self-assessments.schema.json`     | `self-assessments.yaml`            | No          |
| `_index.yaml`        | (convention)                       | Per-directory index                | No          |
| Skill questions      | `skill-questions.schema.json`      | `questions/skills/{id}.yaml`       | Optional    |
| Capability questions | `capability-questions.schema.json` | `questions/capabilities/{id}.yaml` | Optional    |
| Behaviour questions  | `behaviour-questions.schema.json`  | `questions/behaviours/{id}.yaml`   | Optional    |

### DSL extensions

The universe DSL `framework` block currently accepts three arrays:

```
framework {
  proficiencies [awareness, foundational, working, practitioner, expert]
  maturities [emerging, developing, practicing, role_modeling, exemplifying]
  capabilities [delivery, scale, reliability, business, people]
}
```

This must be extended to declare the full pathway skeleton — enough structural
detail that the LLM can fill in coherent prose without inventing the entity
graph:

```
framework {
  proficiencies [awareness, foundational, working, practitioner, expert]
  maturities [emerging, developing, practicing, role_modeling, exemplifying]

  levels {
    J040 { title "Level I" rank 1 experience "0-2 years" }
    J060 { title "Level II" rank 2 experience "3+ years" }
    J070 { title "Level III" rank 3 experience "5+ years" }
    J090 { title "Staff" rank 4 experience "9+ years" }
    J100 { title "Principal" rank 5 experience "12+ years" }
  }

  capabilities {
    delivery {
      name "Delivery"
      skills [data_integration, full_stack_development, problem_discovery, rapid_prototyping]
    }
    scale { ... }
    reliability { ... }
  }

  behaviours {
    outcome_ownership { name "Own the Outcome" }
    systems_thinking { name "Think in Systems" }
  }

  disciplines {
    software_engineering {
      roleTitle "Software Engineer"
      core [architecture_design, code_quality, full_stack_development]
      supporting [devops, cloud_platforms]
      broad [data_modeling, stakeholder_management]
      validTracks [null, platform, sre]
    }
  }

  tracks {
    platform { name "Platform Engineering" }
    sre { name "Site Reliability Engineering" }
  }

  drivers {
    clear_direction {
      name "Clear Direction"
      skills [service_management, stakeholder_management]
      behaviours [polymathic_knowledge, systems_thinking]
    }
  }

  stages [specify, plan, scaffold, code, review, deploy]
}
```

The DSL declares **structure and identifiers**. The LLM generates **prose and
descriptions**.

### LLM generation strategy

Each entity type is prompted independently with:

1. The JSON schema for that entity type (from `products/map/schema/json/`).
2. The structural skeleton from the DSL (identifiers, relationships, counts).
3. The universe context (domain, industry, organization narrative).
4. A domain-specific instruction (e.g., "This is a pharma organization; skills
   should reference drug development, clinical trials, regulatory compliance").

The LLM returns **JSON**, which is then validated against the schema and
converted to YAML for output. JSON output from the LLM is simpler to parse and
validate than YAML.

### Generation order

Entity generation follows a dependency chain — later entities reference earlier
ones:

1. **Framework** — Top-level metadata, no dependencies.
2. **Levels** — Career levels, no entity references.
3. **Stages** — Lifecycle phases, no entity references.
4. **Behaviours** — Standalone entities with prose.
5. **Capabilities** (with skills) — The heaviest entity; each capability
   contains multiple skills with five proficiency descriptions each.
6. **Drivers** — Reference skill and behaviour IDs from steps 4–5.
7. **Disciplines** — Reference skill IDs from step 5, behaviour IDs from step 4,
   track IDs from step 8.
8. **Tracks** — Reference capability IDs from step 5.
9. **Self-assessments** — Reference skill and behaviour IDs.
10. **`_index.yaml`** — Generated from directory listings (deterministic).

### Prose cache integration

LLM-generated prose is expensive and slow. The existing `ProseEngine` cache
system (`.prose-cache.json`) must be extended to cover pathway entity prose.
Cache keys follow the pattern `pathway:{entity_type}:{entity_id}`.

### Validation

Generated data must pass:

- `npx fit-map validate --data=examples/pathway` — Full schema validation
  against all 13 JSON schemas.
- Cross-reference integrity — skill IDs referenced by disciplines exist in
  capabilities; behaviour IDs referenced by drivers exist in behaviours; etc.
- The existing `validateCrossContent()` check `framework_validity` is replaced
  with `pathway_validity` that confirms generated data passes schema validation.

### Output structure

```
examples/pathway/
  framework.yaml
  levels.yaml
  stages.yaml
  drivers.yaml
  self-assessments.yaml
  behaviours/
    _index.yaml
    outcome_ownership.yaml
    systems_thinking.yaml
    ...
  capabilities/
    _index.yaml
    delivery.yaml
    scale.yaml
    ...
  disciplines/
    _index.yaml
    software_engineering.yaml
    ...
  tracks/
    _index.yaml
    platform.yaml
    sre.yaml
    ...
```

This mirrors `data/pathway/` exactly, minus `repository/`
(installation-specific) and `questions/` (deferred).

## Scope

### In scope

- Extended DSL grammar for pathway entity graph declaration.
- DSL parser updates for the extended `framework` block.
- LLM prompt templates for each entity type, using JSON schemas as context.
- JSON output parsing, schema validation, and YAML conversion.
- Integration with the existing `ProseEngine` cache system.
- Pipeline update: `examples/framework/` → `examples/pathway/`.
- Validation update: `pathway_validity` replaces `framework_validity`.
- Self-assessment generation using actual skill/behaviour IDs from the DSL.

### Out of scope

- Question generation (skill, capability, behaviour interview questions).
- Agent sections within capabilities, disciplines, and tracks. The generated
  data includes `human:` sections only unless the DSL explicitly declares agent
  content. Agent authoring is a separate, manual activity.
- Changes to the pathway schema itself (`products/map/schema/json/`).
- Changes to the installed pathway data (`data/pathway/`).
- Replacing `data/pathway/` with generated data — `examples/pathway/` is a
  second, independent instance for testing and evaluation.

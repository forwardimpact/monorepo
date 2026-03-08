# Plan 01 — Claude API Pipeline

> Bespoke generation pipeline using the Claude API with structured prompts,
> schema-guided output, and automated validation loops.

## Approach

Use Claude as the sole generation engine. A Node.js orchestrator sends
structured prompts to the Claude API, receives JSON/YAML/HTML responses,
validates them against existing schemas, and re-prompts on validation failure.
The pipeline runs as a set of npm scripts that populate every example data
directory in the monorepo.

## Architecture

```
seed.yaml ──► Orchestrator (Node.js)
                 │
                 ├── Phase 1: Org Skeleton ──► Claude API ──► ONTOLOGY entities
                 ├── Phase 2: Scenarios    ──► Claude API ──► story arcs
                 ├── Phase 3: Framework    ──► Claude API ──► YAML entities
                 ├── Phase 4: Org Content  ──► Claude API ──► HTML microdata
                 ├── Phase 5: Activity     ──► Claude API ──► JSON/CSV tables
                 └── Phase 6: Personal     ──► Claude API ──► Markdown notes
                 │
                 ▼
            Validator (Ajv + cross-checks)
                 │
            ◄── retry on failure ──►
```

## Seed Data

A single `specs/synthetic-data-pipeline/seed.yaml` file defines the ground
truth that all generated content must respect.

```yaml
organization:
  name: BioNova
  domain: bionova.example
  industry: pharmaceutical
  departments:
    - id: drug_discovery
      name: Drug Discovery
      headcount: 45
      teams:
        - id: oncology_research
          name: Oncology Research Team
          manager: /id/person/artemis
          members: 12
        - id: cardiovascular_research
          name: Cardiovascular Research Team
          manager: /id/person/hermes
          members: 8
    # ... all departments

people:
  count: 211
  naming_convention: greek_mythology
  distribution:
    L1: 40%
    L2: 25%
    L3: 20%
    L4: 10%
    L5: 5%
  disciplines:
    software_engineering: 60%
    data_engineering: 25%
    engineering_management: 15%

projects:
  - id: oncora
    name: Oncora
    type: drug
    phase: clinical_trial_phase_3
    teams: [oncology_research, clinical_data_management]
    timeline: { start: 2024-01, end: 2026-06 }
  # ... all projects

scenarios:
  - id: oncora_push
    name: "Oncora Drug Discovery Push"
    timerange: { start: 2025-03, end: 2025-09 }
    affected_teams: [oncology_research, platform_engineering]
    signals:
      github:
        oncology_research: { commits: spike, prs: elevated }
        platform_engineering: { commits: sustained_high }
      dx_survey:
        oncology_research: { sentiment: rising, engagement: high }
      evidence:
        skills: [data_pipeline_design, statistical_analysis]
        proficiency_floor: working
    narrative: >
      BioNova's lead oncology drug Oncora enters Phase 3 trials,
      triggering intense R&D activity. The Oncology Research Team
      ramps up data pipeline work while Platform Engineering
      provides infrastructure support.

  - id: molecularforge_release
    name: "MolecularForge Major Release"
    timerange: { start: 2025-06, end: 2025-12 }
    affected_teams: [platform_engineering, devops]
    signals:
      github:
        platform_engineering: { commits: sustained_spike, prs: very_high }
      dx_survey:
        platform_engineering: { sentiment: declining, burnout: elevated }
      evidence:
        skills: [system_design, incident_management]
        proficiency_floor: practitioner
    narrative: >
      The MolecularForge platform undergoes a major rewrite.
      Sustained high commit rates lead to burnout signals
      in developer experience surveys.

  - id: gmp_remediation
    name: "Post-GMP Audit Remediation"
    timerange: { start: 2025-01, end: 2025-06 }
    affected_teams: [manufacturing_systems, quality_assurance]
    signals:
      github:
        manufacturing_systems: { commits: moderate, prs: elevated }
      dx_survey:
        quality_assurance: { learning: high, process_satisfaction: rising }
      evidence:
        skills: [compliance_automation, documentation]
        proficiency_floor: foundational
    narrative: >
      Following a GMP audit, Manufacturing teams upskill on
      compliance automation. New evidence emerges against
      compliance markers.

  - id: ai_platform_adoption
    name: "AI Platform Adoption Wave"
    timerange: { start: 2025-04, end: 2025-10 }
    affected_teams: [data_science, clinical_data_management]
    signals:
      github:
        data_science: { commits: gradual_rise, prs: moderate }
      dx_survey:
        data_science: { tooling_satisfaction: rising, experimentation: high }
      evidence:
        skills: [ml_ops, data_pipeline_design]
        proficiency_floor: awareness
    narrative: >
      BioNova adopts an internal AI platform. Data Science teams
      begin integrating ML pipelines, generating new evidence
      against ML and data engineering markers.

  - id: cross_functional_integration
    name: "Cross-Functional Integration Initiative"
    timerange: { start: 2025-02, end: 2025-08 }
    affected_teams: [all]
    signals:
      github:
        all: { cross_team_prs: elevated }
      dx_survey:
        all: { connectedness: rising, collaboration: high }
      evidence:
        skills: [stakeholder_management, systems_thinking]
        proficiency_floor: foundational
    narrative: >
      A company-wide initiative to improve cross-functional
      collaboration. Teams begin contributing to each other's
      repositories, raising connectedness scores.

framework:
  # References to existing schema definitions
  proficiency_levels: [awareness, foundational, working, practitioner, expert]
  maturity_levels: [emerging, developing, practicing, role_modeling, exemplifying]
  capability_areas: [delivery, reliability, scale, business, people]
```

## Generation Phases

### Phase 1 — Organization Skeleton (ONTOLOGY)

**Input:** `seed.yaml` organization + people sections
**Output:** Updated ONTOLOGY.md with entity IRIs, README.md with narrative

**Prompt strategy:**

1. Send seed data with the existing ONTOLOGY.md format as a template
2. Ask Claude to generate all 211 people with greek mythology names, assigned
   to departments/teams with plausible job titles matching their
   discipline/level
3. Generate all organization entities (departments, teams, sub-orgs)
4. Generate project entities with cross-links to teams and people

**Validation:** Parse output, verify all entity counts match seed targets,
all IRIs are unique, all people assigned to exactly one team.

### Phase 2 — Story Scenarios (Narrative Context)

**Input:** `seed.yaml` scenarios + Phase 1 entity IRIs
**Output:** Internal scenario manifest (JSON) with concrete entity bindings

**Prompt strategy:**

1. For each scenario, bind abstract team references to concrete people IRIs
2. Generate month-by-month signal intensity values (0.0–1.0 normalized)
3. Produce causal chains: scenario → team activity → individual signals

**Validation:** Every referenced person IRI exists in Phase 1 output. Signal
curves are monotonic where expected (e.g., "rising" sentiment doesn't dip).

### Phase 3 — Framework Content (Map YAML)

**Input:** `seed.yaml` framework section + existing JSON schemas
**Output:** Complete YAML files under `products/map/examples/`

**Prompt strategy:**

1. Send each JSON schema as context with 1-2 example entries
2. Ask Claude to generate complete files matching schema constraints
3. Use the vocabulary standards from AGENTS.md for level-appropriate language
4. Generate `self-assessments.yaml` using people from Phase 1

**Validation:** Run `npx fit-map validate` on every generated file. Re-prompt
on any validation error with the error message as context.

**Validation loop:**
```
Generate YAML ──► fit-map validate ──► pass? ──► commit
                       │                          ▲
                       ▼                          │
                  extract errors ──► re-prompt ───┘
                       (max 3 retries)
```

### Phase 4 — Organizational Content (Guide HTML)

**Input:** Phase 1 entities + Phase 2 scenarios + GENERATE.prompt.md format
**Output:** HTML microdata files under `products/guide/examples/knowledge/`

**Prompt strategy:**

1. Send GENERATE.prompt.md as the format specification
2. Generate one HTML file per content type (articles, people, orgs, etc.)
3. Each file must use `itemid` attributes matching Phase 1 IRIs
4. Cross-reference entities using `itemscope`/`itemprop` nesting

**Validation:** Parse HTML with a microdata parser, verify all `itemid` values
exist in the ONTOLOGY, verify all cross-references resolve.

### Phase 5 — Activity Content (Landmark Tables)

**Input:** Phase 1 people + Phase 2 scenario signals
**Output:** JSON/CSV tables for Landmark consumption

**Tables generated:**

| Table                       | Fields                                               |
| --------------------------- | ---------------------------------------------------- |
| `organization_people`       | email, name, discipline, level, track, manager_email |
| `github_events`             | timestamp, author_email, repo, event_type, additions, deletions |
| `github_artifacts`          | repo, path, language, lines, complexity              |
| `getdx_snapshots`           | snapshot_id, date, team_id                           |
| `getdx_snapshot_team_scores`| snapshot_id, team_id, driver_id, score, percentile   |

**Prompt strategy:**

1. For `organization_people`: derive directly from Phase 1 people with
   discipline/level/track from seed distribution
2. For `github_events`: generate 12 months of daily events per person,
   modulated by scenario signal curves from Phase 2
3. For `getdx_snapshots`: generate monthly snapshots with scores driven by
   scenario signals, correlated with the 14+ drivers from `drivers.yaml`
4. For evidence: generate skill marker evidence for selected people based on
   scenario-driven proficiency expectations

**Validation:**
- Every `author_email` / `email` in activity tables exists in `organization_people`
- Every `manager_email` resolves to another person in the roster
- Every `driver_id` in survey scores exists in `drivers.yaml`
- GitHub activity patterns match scenario signal curves (statistical correlation check)
- DX survey score trajectories match scenario expectations

### Phase 6 — Personal Content (Basecamp Markdown)

**Input:** 3-5 selected people from Phase 1 + their activity data from Phase 5
**Output:** Markdown notes under example Basecamp knowledge bases

**Prompt strategy:**

1. Select people at different levels (L1, L3, L5) for variety
2. Generate weekly briefing notes referencing real projects and events
3. Generate personal knowledge graph entries linking to org entities
4. Generate meeting prep notes and candidate tracking docs

**Validation:** All entity references in Markdown link to real ONTOLOGY IRIs.

## Cross-Content Validation

After all phases complete, run a final cross-validation pass:

```javascript
// cross-validate.js
const checks = [
  // Every person in org HTML has a matching organization_people row
  'org_html_people ⊆ activity_people',
  // Every person's discipline/level matches framework YAML constraints
  'people_roles ⊂ valid_framework_combinations',
  // GitHub activity correlates with scenario signals
  'github_patterns ~ scenario_signals (r > 0.7)',
  // DX survey scores correlate with scenario expectations
  'dx_scores ~ scenario_expectations (r > 0.6)',
  // Evidence proficiency levels ≥ scenario proficiency_floor
  'evidence_proficiency ≥ scenario_floor',
  // All HTML itemid values exist in ONTOLOGY
  'html_itemids ⊆ ontology_iris',
  // All self-assessment people exist in organization
  'self_assessment_people ⊆ org_people',
  // Basecamp entity references resolve
  'basecamp_refs ⊆ ontology_iris',
]
```

## Output File Mapping

| Generated Content              | Target Location                              |
| ------------------------------ | -------------------------------------------- |
| ONTOLOGY.md                    | `products/guide/examples/knowledge/`         |
| README.md                      | `products/guide/examples/knowledge/`         |
| HTML microdata files           | `products/guide/examples/knowledge/`         |
| Framework YAML                 | `products/map/examples/`                     |
| Organization people            | `products/map/examples/activity/`            |
| GitHub events/artifacts        | `products/map/examples/activity/`            |
| GetDX snapshots/scores         | `products/map/examples/activity/`            |
| Evidence records               | `products/map/examples/activity/`            |
| Personal knowledge base        | `products/basecamp/template/knowledge/`      |

## CLI Interface

```sh
# Full pipeline (all phases)
npx fit-map generate

# Individual phases
npx fit-map generate --phase org
npx fit-map generate --phase scenarios
npx fit-map generate --phase framework
npx fit-map generate --phase content
npx fit-map generate --phase activity
npx fit-map generate --phase personal

# Validation only
npx fit-map generate --validate-only

# Dry run (show what would be generated)
npx fit-map generate --dry-run
```

## Configuration

```yaml
# generate.config.yaml
claude:
  model: claude-sonnet-4-20250514
  max_tokens: 8192
  temperature: 0.3          # Low for consistency
  retry_on_validation: 3    # Max re-prompts per generation step
  rate_limit_rpm: 50        # Requests per minute

output:
  overwrite: true           # Clean break — replace all existing content
  format_html: true         # Pretty-print HTML output
  format_yaml: true         # Normalize YAML formatting
```

## Cost Estimate

| Phase              | Estimated Tokens (in/out) | Approx Cost |
| ------------------ | ------------------------- | ----------- |
| Org Skeleton       | 50K / 30K                 | $0.60       |
| Scenarios          | 30K / 20K                 | $0.35       |
| Framework YAML     | 80K / 60K                 | $1.00       |
| Org Content (HTML) | 200K / 150K               | $2.50       |
| Activity Tables    | 100K / 80K                | $1.30       |
| Personal Content   | 20K / 15K                 | $0.25       |
| Validation retries | ~30% overhead             | $1.80       |
| **Total**          | **~650K tokens**          | **~$7.80**  |

## Implementation Phases

### Phase A — Scaffolding (1 day)
- Create `scripts/generate/` directory with orchestrator
- Define `seed.yaml` with full organization structure
- Set up Ajv validation harness for generated YAML
- Wire up Claude API client with retry logic

### Phase B — Framework Generation (2 days)
- Implement Phase 3 (framework YAML) with validation loop
- Verify all output passes `npx fit-map validate`
- Generate `self-assessments.yaml` with realistic profiles

### Phase C — Organization Content (3 days)
- Implement Phases 1-2 (org skeleton + scenarios)
- Implement Phase 4 (HTML microdata generation)
- Build HTML microdata parser for validation
- Verify cross-references between HTML and ONTOLOGY

### Phase D — Activity & Personal Content (2 days)
- Implement Phase 5 (Landmark activity tables)
- Implement Phase 6 (Basecamp personal content)
- Statistical validation of signal correlations

### Phase E — Integration & Cleanup (1 day)
- Cross-content validation pass
- Remove old hand-crafted example content
- CI integration: `npm run generate` in CI pipeline
- Documentation updates

## Strengths

- **Highest quality output**: Claude excels at generating coherent, contextual
  content with complex cross-references
- **Schema-aware generation**: JSON schemas sent as prompt context ensure
  structural validity
- **Validation loops**: Automatic re-prompting on validation failure
- **Vocabulary compliance**: Claude can follow the vocabulary standards from
  AGENTS.md verbatim

## Weaknesses

- **API dependency**: Requires ANTHROPIC_API_KEY and network access
- **Cost per run**: ~$8 per full regeneration (acceptable for infrequent runs)
- **Non-deterministic**: Different runs produce different content (mitigated by
  low temperature and seed data constraints)
- **Rate limits**: Large generation runs may hit API rate limits

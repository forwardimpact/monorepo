# PLAN-07: Story DSL Rewrite

> Write the concrete `story.dsl` changes — the `clinical {}` block,
> new projects, new scenarios, updated datasets, and new outputs.
> This plan produces no library code; it is a pure DSL content change
> that exercises all preceding plans.

## Dependencies

- **PLAN-01** — Parser supports `clinical {}`, conditions, sites, trials,
  criteria, content, `DOTTED_IDENT`, `per_*` sentinels, `supabase_migration`,
  `embeddings_jsonl`.
- **PLAN-06** — Dataset parser supports `conditions` field.

All plans (01–06, 08) should be implemented before executing this one,
because this file exercises the full grammar, entity generation, prose key
collection, rendering, and pipeline.

## Dependency Graph

```
All plans → PLAN-07 (integration test)
```

## Files to Modify

| File | Change |
|------|--------|
| `data/synthetic/story.dsl` | Add clinical block, projects, scenarios; update datasets and outputs |

## Changes

### 1. Add `clinical {}` Block

Insert after the last `content` block (line 772) and before the datasets
section (line 774). The clinical block is a single top-level block
containing all clinical domain entities.

#### 6 Conditions

```dsl
clinical {
  condition lung_cancer {
    name "Non-Small Cell Lung Cancer"
    icd10 ["C34.90"]
    synonyms ["NSCLC", "lung cancer", "non-small cell"]
    synthea_module "lung_cancer"
    severity "life-threatening"
    prose_topic "non-small cell lung cancer explained for patients and caregivers"
    prose_tone "empathetic, accessible"
  }

  condition diabetes_t2 {
    name "Type 2 Diabetes Mellitus"
    icd10 ["E11"]
    synonyms ["high blood sugar", "insulin resistance", "adult-onset diabetes"]
    synthea_module "diabetes"
    severity "chronic"
    prose_topic "type 2 diabetes in plain language for patients"
    prose_tone "empathetic, accessible"
  }

  condition cardiovascular {
    name "Cardiovascular Disease"
    icd10 ["I25", "I50"]
    synonyms ["heart disease", "coronary artery disease", "heart failure"]
    synthea_module "cardiovascular_disease"
    severity "chronic"
    prose_topic "cardiovascular disease explained for patients and caregivers"
    prose_tone "empathetic, accessible"
  }

  condition breast_cancer {
    name "HER2-Positive Breast Cancer"
    icd10 ["C50"]
    synonyms ["HER2+ breast cancer", "breast cancer", "HER2 positive"]
    synthea_module "breast_cancer"
    severity "life-threatening"
    prose_topic "HER2-positive breast cancer explained for patients"
    prose_tone "empathetic, accessible"
  }

  condition hypertension {
    name "Hypertension"
    icd10 ["I10"]
    synonyms ["high blood pressure", "elevated blood pressure", "HTN"]
    synthea_module "hypertension"
    severity "chronic"
    prose_topic "hypertension explained for patients and caregivers"
    prose_tone "empathetic, accessible"
  }

  condition copd {
    name "Chronic Obstructive Pulmonary Disease"
    icd10 ["J44"]
    synonyms ["COPD", "chronic bronchitis", "emphysema"]
    synthea_module "copd"
    severity "chronic"
    prose_topic "COPD explained for patients and caregivers"
    prose_tone "empathetic, accessible"
  }
```

#### 5 Sites

```dsl
  site cambridge_main {
    name "BioNova Cambridge Research Center"
    address "200 CambridgePark Drive"
    city "Cambridge"
    state "MA"
    country "US"
    org headquarters
    capacity 500
    specialties [oncology, cardiology, endocrinology]
  }

  site boston_clinical {
    name "BioNova Boston Clinical Unit"
    address "75 Francis Street"
    city "Boston"
    state "MA"
    country "US"
    org headquarters
    capacity 200
    specialties [oncology, neurology]
  }

  site new_york_satellite {
    name "BioNova New York Research Satellite"
    address "1275 York Avenue"
    city "New York"
    state "NY"
    country "US"
    org headquarters
    capacity 300
    specialties [oncology, cardiology, pulmonology]
  }

  site chicago_research {
    name "BioNova Chicago Research Center"
    address "5841 South Maryland Avenue"
    city "Chicago"
    state "IL"
    country "US"
    org headquarters
    capacity 250
    specialties [endocrinology, cardiology]
  }

  site san_francisco_trials {
    name "BioNova San Francisco Trial Site"
    address "505 Parnassus Avenue"
    city "San Francisco"
    state "CA"
    country "US"
    org headquarters
    capacity 150
    specialties [oncology, pulmonology]
  }
```

#### 6 Trials

```dsl
  trial oncora_phase3 {
    name "ONCORA-301: Phase 3 Adaptive Trial for Advanced Solid Tumors"
    protocol_id "BNV-ONC-2024-301"
    project oncora
    phase "phase_3"
    therapeutic_area "oncology"
    conditions [lung_cancer]
    sites [cambridge_main, boston_clinical, new_york_satellite]
    principal_investigator @thoth
    sponsor "BioNova Therapeutics"
    status "recruiting"
    target_enrollment 450
    current_enrollment 287
    start_date 2024-06
    estimated_end_date 2026-06
    arms ["mAb + standard of care", "placebo + standard of care"]
    prose_topic "Phase 3 adaptive clinical trial for solid tumor treatment"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 18
        age_max 75
        conditions_required [lung_cancer]
        prior_treatments_allowed ["chemotherapy", "radiation"]
        ecog_max 2
        custom ["Measurable disease per RECIST 1.1",
                "Adequate organ function per protocol"]
      }
      exclusion {
        conditions_excluded [cardiovascular]
        active_autoimmune true
        prior_immunotherapy true
        custom ["Known brain metastases",
                "Pregnancy or lactation"]
      }
    }
  }

  trial oncora_phase1 {
    name "ONCORA-101: Phase 1 Dose Escalation Study"
    protocol_id "BNV-ONC-2023-101"
    project oncora
    phase "phase_1"
    therapeutic_area "oncology"
    conditions [lung_cancer]
    sites [cambridge_main]
    principal_investigator @thoth
    sponsor "BioNova Therapeutics"
    status "completed"
    target_enrollment 45
    current_enrollment 45
    start_date 2023-03
    estimated_end_date 2024-06
    arms ["mAb low dose", "mAb mid dose", "mAb high dose"]
    prose_topic "Phase 1 dose escalation for novel monoclonal antibody"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 18
        age_max 80
        conditions_required [lung_cancer]
        prior_treatments_allowed ["chemotherapy"]
        ecog_max 1
        custom ["Life expectancy of at least 12 weeks"]
      }
      exclusion {
        conditions_excluded []
        active_autoimmune false
        prior_immunotherapy false
        custom ["Active infection requiring systemic therapy"]
      }
    }
  }

  trial cardio_outcomes {
    name "CARDIO-PREVENT: Cardiovascular Outcomes Study"
    protocol_id "BNV-CV-2024-301"
    phase "phase_3"
    therapeutic_area "cardiology"
    conditions [cardiovascular, hypertension]
    sites [cambridge_main, boston_clinical, chicago_research]
    principal_investigator @chronos
    sponsor "BioNova Therapeutics"
    status "recruiting"
    target_enrollment 600
    current_enrollment 341
    start_date 2024-03
    estimated_end_date 2027-03
    arms ["novel ACE inhibitor + standard care", "standard care only", "placebo + standard care"]
    prose_topic "Phase 3 cardiovascular outcomes prevention study"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 40
        age_max 80
        conditions_required [cardiovascular]
        prior_treatments_allowed ["statins", "antihypertensives", "aspirin"]
        ecog_max 2
        custom ["At least one prior cardiovascular event",
                "Stable on current medication for 30 days"]
      }
      exclusion {
        conditions_excluded []
        active_autoimmune false
        prior_immunotherapy false
        custom ["Severe renal impairment (eGFR < 30)",
                "NYHA Class IV heart failure",
                "Planned cardiac surgery within 6 months"]
      }
    }
  }

  trial diabetes_prevention {
    name "DM-SHIELD: Diabetes Prevention and Early Intervention"
    protocol_id "BNV-DM-2025-201"
    phase "phase_2"
    therapeutic_area "endocrinology"
    conditions [diabetes_t2]
    sites [cambridge_main, chicago_research]
    principal_investigator @hygieia
    sponsor "BioNova Therapeutics"
    status "active_not_recruiting"
    target_enrollment 200
    current_enrollment 200
    start_date 2025-01
    estimated_end_date 2026-12
    arms ["GLP-1 agonist + lifestyle intervention", "lifestyle intervention only"]
    prose_topic "Phase 2 diabetes prevention and early intervention trial"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 30
        age_max 65
        conditions_required [diabetes_t2]
        prior_treatments_allowed ["metformin"]
        ecog_max 1
        custom ["HbA1c between 5.7% and 6.4%",
                "BMI between 25 and 40"]
      }
      exclusion {
        conditions_excluded [cardiovascular]
        active_autoimmune false
        prior_immunotherapy false
        custom ["Type 1 diabetes",
                "Current use of insulin"]
      }
    }
  }

  trial her2_combo {
    name "HER2-SYNERGY: Combination Therapy for HER2+ Breast Cancer"
    protocol_id "BNV-BC-2025-201"
    phase "phase_2"
    therapeutic_area "oncology"
    conditions [breast_cancer]
    sites [boston_clinical, new_york_satellite, san_francisco_trials]
    principal_investigator @asclepius
    sponsor "BioNova Therapeutics"
    status "recruiting"
    target_enrollment 180
    current_enrollment 72
    start_date 2025-03
    estimated_end_date 2027-06
    arms ["ADC + trastuzumab", "trastuzumab + pertuzumab", "ADC monotherapy"]
    prose_topic "Phase 2 combination therapy for HER2-positive breast cancer"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 18
        age_max 70
        conditions_required [breast_cancer]
        prior_treatments_allowed ["trastuzumab", "chemotherapy"]
        ecog_max 1
        custom ["HER2-positive confirmed by IHC or FISH",
                "At least one measurable lesion"]
      }
      exclusion {
        conditions_excluded [cardiovascular]
        active_autoimmune false
        prior_immunotherapy true
        custom ["Prior ADC therapy",
                "Active CNS metastases"]
      }
    }
  }

  trial copd_inhaler {
    name "BREATHE-EASY: Novel Inhaler for COPD Management"
    protocol_id "BNV-PL-2025-101"
    phase "phase_1"
    therapeutic_area "pulmonology"
    conditions [copd]
    sites [new_york_satellite, san_francisco_trials]
    principal_investigator @apollo
    sponsor "BioNova Therapeutics"
    status "not_yet_recruiting"
    target_enrollment 60
    current_enrollment 0
    start_date 2025-09
    estimated_end_date 2026-09
    arms ["novel LAMA/LABA combination", "standard LAMA/LABA", "placebo"]
    prose_topic "Phase 1 novel inhaler combination for COPD management"
    prose_tone "clinical, accessible"
    criteria {
      inclusion {
        age_min 40
        age_max 80
        conditions_required [copd]
        prior_treatments_allowed ["bronchodilators", "inhaled corticosteroids"]
        ecog_max 2
        custom ["FEV1 30-80% predicted",
                "At least 10 pack-year smoking history"]
      }
      exclusion {
        conditions_excluded []
        active_autoimmune false
        prior_immunotherapy false
        custom ["Current asthma diagnosis",
                "COPD exacerbation within 4 weeks",
                "Supplemental oxygen requirement > 3 L/min"]
      }
    }
  }
```

#### Clinical Content

```dsl
  content {
    condition_explainers per_condition
    therapy_descriptions 6
    therapy_topics [mab_therapy, immunotherapy, targeted_therapy,
                    chemotherapy, radiation, clinical_trials_101]
    trial_faqs per_trial
    consent_summaries per_trial
    site_descriptions per_site
    patient_stories 10
    patient_story_conditions [lung_cancer, diabetes_t2,
                              cardiovascular, breast_cancer]
  }
} // end clinical
```

### 2. Add 3 New Projects

Insert after the existing `project cross_func_initiative` block:

```dsl
project finder {
  name "Clinical Research Finder"
  type "product"
  teams [platform_engineering, developer_experience, clinical_development]
  timeline_start 2025-06
  timeline_end 2026-06
  prose_topic "patient-facing clinical trial search application"
  prose_tone "technical, user-centered"
  milestones ["MVP launch", "Semantic search", "Eligibility screener",
              "Staff admin tools", "Public GA"]
  risks ["clinical data accuracy", "accessibility compliance",
         "patient trust and adoption"]
  technical_choices ["Next.js App Router", "self-hosted Supabase",
                     "pgvector for semantic search", "Forward Impact shared libraries"]
}

project patient_portal {
  name "BioNova Patient Portal"
  type "product"
  teams [enterprise_applications, security_compliance]
  timeline_start 2025-09
  timeline_end 2026-12
  prose_topic "authenticated patient portal for enrolled participants"
  prose_tone "technical, compliance-aware"
  milestones ["Auth integration", "Visit scheduling", "Lab results viewer"]
  risks ["HIPAA compliance", "GoTrue scaling", "mobile responsiveness"]
  technical_choices ["shared Supabase backend", "GoTrue auth", "React Native web"]
}

project trial_management {
  name "BioNova Trial Management System"
  type "platform"
  teams [clinical_development, data_science_ai]
  timeline_start 2024-09
  timeline_end 2026-03
  prose_topic "internal clinical trial management and data pipeline"
  prose_tone "technical, data-intensive"
  milestones ["EDC integration", "Randomization engine", "DSMB dashboard"]
  risks ["data migration from legacy CTMS", "regulatory validation"]
  technical_choices ["Supabase PostgreSQL", "PostgREST APIs", "Metabase dashboards"]
}
```

**Note:** The `teams` arrays reference team IDs that must exist in the DSL's
department/team hierarchy. Verify that `platform_engineering`,
`developer_experience`, `clinical_development`, `enterprise_applications`,
`security_compliance`, and `data_science_ai` exist as team IDs in the current
story.dsl. If any are missing, either add them to an existing department or
adjust the team references to use existing IDs.

### 3. Add 2 New Scenarios

Insert after the existing `scenario one_bionova` block. The exact DSL content
is in [SCRATCHPAD-DEMO-STORY.md §Finder Scenarios](SCRATCHPAD-DEMO-STORY.md):

- `scenario finder_mvp_push` — affects `platform_engineering`,
  `developer_experience`, `clinical_development`
- `scenario finder_ga_release` — affects `platform_engineering`,
  `developer_experience`

### 4. Update Dataset Block

Replace the `trial_patients` block (lines 776-780):

```dsl
dataset trial_patients {
  tool synthea
  population 200
  conditions [lung_cancer, diabetes_t2, cardiovascular,
              breast_cancer, hypertension, copd]
}
```

### 5. Remove Researchers Dataset

Delete lines 791-802 (`dataset researchers { ... }`) and lines 811-812
(`output researchers yaml/markdown`).

### 6. Add New Output Blocks

After the existing output blocks (keeping `claims_claims` outputs), add:

```dsl
output finder_seed supabase_migration {
  path "products/finder/site/supabase/migrations/"
  prefix "seed"
  entities [clinical.conditions, clinical.sites,
            clinical.researchers, clinical.trials, clinical.criteria]
  include_embeddings true
}

output finder_embeddings embeddings_jsonl {
  path "products/finder/site/supabase/migrations/seed_embeddings.jsonl"
  entities [clinical.conditions, clinical.trials]
  text_fields {
    clinical.conditions [name, synonyms, prose_explainer]
    clinical.trials [name, therapeutic_area, arms, prose_description]
  }
}
```

### 7. Keep Unchanged

- `dataset claims { ... }` — unchanged
- `output claims_claims parquet { ... }` — unchanged
- `output claims_claims sql { ... }` — unchanged
- All existing `content`, `standard`, `snapshots`, `org`, `department`,
  `people` blocks — unchanged
- Existing 5 projects and 5 scenarios — unchanged

## Verification

### Parse Test

```sh
cd libraries/libsyntheticgen
# Run existing parser tests — must still pass
bun test

# Parse the rewritten story.dsl directly
node -e "
  import { tokenize } from './src/dsl/tokenizer.js';
  import { parse } from './src/dsl/parser.js';
  import { readFileSync } from 'fs';
  const src = readFileSync('../../data/synthetic/story.dsl', 'utf-8');
  const ast = parse(tokenize(src));
  console.log('clinical:', ast.clinical !== null);
  console.log('conditions:', ast.clinical.conditions.length);
  console.log('sites:', ast.clinical.sites.length);
  console.log('trials:', ast.clinical.trials.length);
  console.log('projects:', ast.projects.length);
  console.log('scenarios:', ast.scenarios.length);
  console.log('datasets:', ast.datasets.length);
  console.log('outputs:', ast.outputs.length);
"
```

Expected output:
```
clinical: true
conditions: 6
sites: 5
trials: 6
projects: 8    (5 existing + 3 new)
scenarios: 7   (5 existing + 2 new)
datasets: 2    (trial_patients + claims; researchers removed)
outputs: 4     (2 claims kept + 1 supabase_migration + 1 embeddings_jsonl; 3 trial_patients + 2 researchers removed)
```

### Full Pipeline Smoke Test

```sh
bun run fit-terrain generate --mode no-prose
```

Verify:
- No parse errors
- Entity graph includes `clinical` block
- Clinical prose keys are collected (logged)
- SQL migration files are generated at configured path
- Embeddings JSONL is generated at configured path
- Existing outputs (claims) still generate

### Supabase Verification

Load the generated SQL migrations into a local Supabase instance:

```sh
supabase start
for f in products/finder/site/supabase/migrations/seed_*.sql; do
  supabase db execute --local < "$f"
done
```

Verify:
- All tables created (`conditions`, `sites`, `researchers`, `trials`,
  `criteria`, `trial_sites`, `trial_conditions`, `condition_embeddings`)
- All rows inserted (6 conditions, 5 sites, 6 trials, etc.)
- Foreign key constraints hold
- `condition_embeddings` table has `vector(384)` column
- Junction tables populated correctly

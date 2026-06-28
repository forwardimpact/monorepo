# Terrain DSL

Terrain files define a complete synthetic environment. A minimal reference DSL
ships with the package; projects supply their own DSL file via `--story=path`.

## Top-Level Blocks

```dsl
terrain Name {
  domain "example.dev"
  industry "technology"
  seed 42

  org hq { ... }
  department engineering { ... }
  team backend { ... }
  people { ... }
  project alpha { ... }
  snapshots { ... }
  scenario launch_push { ... }
  standard { ... }
  content guide_html { ... }
  content outpost_markdown { ... }

  clinical { ... }      // optional — patient/trial domain

  dataset patients { ... }
  output patients_patient json { ... }
}
```

### Key Blocks

| Block | Role |
| ----- | ---- |
| `org` / `department` / `team` | Hierarchy with headcounts, managers, repos |
| `people` | Count, name theme, level + discipline distributions |
| `project` | Cross-team initiatives with timelines and prose topics |
| `snapshots` | GetDX snapshot generation (quarterly intervals) |
| `scenario` | Time-bounded team effects (commit volume, DX trajectories, evidence) |
| `standard` | Pathway engineering standard: levels, capabilities, behaviours, disciplines, tracks, drivers |
| `content` | Article/blog/FAQ counts, persona configs, briefing counts |
| `clinical` | Optional patient-and-trial domain — see § Clinical Block |
| `dataset` / `output` | Faker, Synthea, SDV inputs and rendered formats — see [`datasets.md`](datasets.md) |

---

## Clinical Block

The `clinical {}` block declares a patient-and-trial domain that maps onto
Synthea-backed patient data and patient-facing prose. Only
`trial.principal_investigator` and `site.org` link it to the org graph.

```dsl
clinical {
  condition diabetes_t2 {
    name "Type 2 Diabetes"
    icd10 ["E11"]
    synonyms ["high blood sugar"]
    synthea_module diabetes
    severity chronic
    prose_topic "diabetes for patients"
    prose_tone "empathetic"
  }

  site cambridge {
    name "Cambridge Medical Center"
    city "Cambridge" state "MA"
    org headquarters
    specialties ["endocrinology"]
  }

  trial oncora_p3 {
    name "ONCORA-301"
    phase "phase_3"
    conditions [diabetes_t2]
    sites [cambridge]
    principal_investigator @sarah_chen
    sponsor "Acme Bio"
    status "recruiting"
    target_enrollment 450
    start_date 2025-03
    estimated_end_date 2027-06
    criteria { inclusion { age_min 18 age_max 75 } }
  }

  content {
    condition_explainers per_condition
    trial_faqs per_trial
    consent_summaries per_trial
    patient_stories 4
    patient_story_conditions [diabetes_t2]
  }
}
```

### Sub-blocks

- **condition** — ICD-10, synonyms, `synthea_module` (so `dataset.conditions`
  resolves to a Synthea module), optional `prose_topic` / `prose_tone`.
- **site** — `org` references an org id from the parent terrain.
- **trial** — `principal_investigator @name` references a `people` manager;
  `project` optionally references a project id; `conditions` and `sites` are
  ids from this block; `criteria { inclusion {} exclusion {} }` declares
  eligibility.
- **content** — Counts accept a number or one of `per_condition`,
  `per_trial`, `per_site` (scales with declared entities).

### Cross-domain references

| From | To | Resolved at |
| ---- | -- | ----------- |
| `trial.principal_investigator` | person (manager) | entity generation |
| `trial.project` | project id | entity generation |
| `site.org` | org id | entity generation |
| `dataset.conditions[]` | clinical.condition.id → `synthea_module` | dataset stage |

### Rendered output

A `clinical {}` block adds seven HTML files under the knowledge output
directory (`condition-explainers`, `therapy-descriptions`, `trial-faqs`,
`consent-summaries`, `site-descriptions`, `patient-stories`, `trial-cards`),
each carrying Schema.org microdata (`MedicalCondition`, `MedicalTrial`,
`MedicalClinic`, `MedicalTherapy`) the Guide knowledge-graph ingest crawls.

Patient-facing prose uses a medical-communications system prompt; the
existing `generate` verb and prose cache cover it without extra flags.

terrain clinical {
  domain "test.example"
  industry "pharmaceutical"
  seed 42

  org testorg {
    name "Test Organization"
  }

  department eng {
    name "Engineering"
    parent testorg
    headcount 5

    team alpha {
      name "Alpha Team"
      size 5
      manager @alpha_lead
      repos ["alpha-service"]
    }
  }

  people {
    count 5
    distribution {
      J040 60%
      J050 40%
    }
    disciplines {
      software-engineering 100%
    }
  }

  project oncora {
    name "Oncora"
    type "drug"
    teams [alpha]
    prose_topic "Phase 3 oncology program"
    prose_tone "clinical"
  }

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role-modeling, exemplifying]

    levels {
      J040 { title "Software Engineer" rank 1 experience "0-2 years" }
      J050 { title "Senior Engineer" rank 2 experience "2-5 years" }
    }

    capabilities {
      coding { name "Coding" skills [python-dev, code-review] }
    }

    behaviours {
      collaboration { name "Collaboration" }
    }

    disciplines {
      software-engineering {
        roleTitle "Software Engineer"
        core [python-dev]
        supporting [code-review]
      }
    }

    tracks {
      backend { name "Backend" }
    }

    drivers {
      clear-direction {
        name "Clear Direction"
        skills [python-dev]
        behaviours [collaboration]
      }
    }
  }

  clinical {
    condition diabetes-t2 {
      name "Type 2 Diabetes"
      icd10 [E11]
      synonyms ["high blood sugar"]
      synthea_module diabetes
      severity chronic
    }

    site cambridge {
      name "Cambridge Center"
      address "200 Park Dr"
      city "Cambridge"
      state "MA"
      country "US"
      org testorg
      capacity 500
      specialties [oncology]
    }

    trial oncora-p3 {
      name "ONCORA-301"
      protocol_id "BNV-ONC-2024-301"
      project oncora
      phase "phase_3"
      therapeutic_area "oncology"
      conditions [diabetes-t2]
      sites [cambridge]
      principal_investigator @alpha_lead
      sponsor "BioNova"
      status "recruiting"
      target_enrollment 450
      current_enrollment 287
      start_date 2024-06
      estimated_end_date 2026-06
      arms ["mAb + SoC", "placebo + SoC"]
      criteria {
        inclusion {
          age_min 18
          age_max 75
          conditions_required ["diabetes_t2"]
          ecog_max 2
          custom ["Confirmed diagnosis of Type 2 Diabetes", "HbA1c between 7.0% and 10.5%"]
        }
        exclusion {
          conditions_excluded ["type_1_diabetes"]
          active_autoimmune true
          prior_immunotherapy false
          custom ["Active CNS metastases", "History of cardiac events within 6 months"]
        }
      }
    }
  }

  output clinical-db supabase_migration {
    prefix "bn"
    entities [clinical.conditions, clinical.sites, clinical.researchers, clinical.trials, clinical.criteria]
    include_embeddings true
  }

  output clinical-embed embeddings_jsonl {
    path "out/clinical.jsonl"
    entities [clinical.conditions]
    text_fields {
      clinical.conditions [name, synonyms]
    }
  }
}

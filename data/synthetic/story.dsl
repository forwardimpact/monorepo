// terrain.dsl — BioNova synthetic data specification

terrain BioNova {
  domain "bionova.example"
  industry "pharmaceutical"
  seed 42

  // ─── Organization ───────────────────────────────

  org headquarters {
    name "BioNova Global Headquarters"
    location "Cambridge, MA"
  }

  department rd {
    name "BioNova R&D"
    parent headquarters
    headcount 55

    team drug_discovery {
      name "Drug Discovery Team"
      size 12
      manager @thoth
      repos ["oncology-pipelines", "cell-assay-lib", "molecular-screening"]
    }

    team clinical_development {
      name "Clinical Development Team"
      size 10
      manager @chronos
      repos ["clinical-stream", "trial-data-manager"]
    }

    team genomics {
      name "Genomics Team"
      size 8
      manager @apollo
      repos ["genome-sequencer", "variant-caller"]
    }

    team biostatistics {
      name "Biostatistics Team"
      size 8
      manager @hygieia
      repos ["stat-engine", "trial-analyzer"]
    }

    team regulatory_science {
      name "Regulatory Science Team"
      size 7
      manager @themis
      repos ["compliance-tracker", "submission-portal"]
    }
  }

  department it {
    name "BioNova IT"
    parent headquarters
    headcount 65

    team platform_engineering {
      name "Platform Engineering Team"
      size 15
      manager @athena
      repos ["molecularforge", "data-lake-infra", "api-gateway"]
    }

    team data_science_ai {
      name "Data Science & AI Team"
      size 12
      manager @prometheus
      repos ["ml-pipeline", "prediction-models", "feature-store"]
    }

    team cloud_infrastructure {
      name "Cloud Infrastructure Team"
      size 10
      manager @hephaestus
      repos ["terraform-bionova", "k8s-configs", "monitoring-stack"]
    }

    team security_compliance {
      name "Security & Compliance Team"
      size 8
      manager @ares
      repos ["soc2-automation", "vulnerability-scanner"]
    }

    team enterprise_applications {
      name "Enterprise Applications Team"
      size 10
      manager @hermes
      repos ["erp-integrations", "identity-hub"]
    }

    team developer_experience {
      name "Developer Experience Team"
      size 10
      manager @iris
      repos ["dev-portal", "ci-cd-platform", "sdk-toolkit"]
    }
  }

  department manufacturing {
    name "BioNova Manufacturing"
    parent headquarters
    headcount 40

    team process_engineering {
      name "Process Engineering Team"
      size 10
      manager @demeter
      repos ["batch-control", "gmp-workflow"]
    }

    team quality_assurance {
      name "Quality Assurance Team"
      size 10
      manager @astraea
      repos ["qa-automation", "capa-tracker"]
    }

    team supply_chain {
      name "Supply Chain Team"
      size 10
      manager @tyche
      repos ["supply-optimizer", "logistics-api"]
    }

    team manufacturing_it {
      name "Manufacturing IT Team"
      size 10
      manager @daedalus
      repos ["scada-bridge", "mes-connector"]
    }
  }

  department commercial {
    name "BioNova Commercial"
    parent headquarters
    headcount 51

    team medical_affairs {
      name "Medical Affairs Team"
      size 8
      manager @asclepius
      repos ["medical-info-portal", "kol-tracker"]
    }

    team market_access {
      name "Market Access Team"
      size 8
      manager @plutus
      repos ["pricing-engine", "payer-analytics"]
    }

    team digital_marketing {
      name "Digital Marketing Team"
      size 10
      manager @aphrodite
      repos ["campaign-platform", "analytics-dashboard"]
    }

    team field_operations {
      name "Field Operations Team"
      size 10
      manager @artemis
      repos ["field-force-app", "territory-planner"]
    }

    team customer_support {
      name "Customer Support Team"
      size 8
      manager @hestia
      repos ["support-portal", "knowledge-base"]
    }

    team commercial_analytics {
      name "Commercial Analytics Team"
      size 7
      manager @metis
      repos ["market-dashboard", "forecast-models"]
    }
  }

  // ─── People ─────────────────────────────────────

  people {
    count 211
    names "greek_mythology"
    distribution {
      J040 40%
      J060 25%
      J070 20%
      J080 10%
      J090 5%
    }
    disciplines {
      software_engineering 60%
      data_engineering 25%
      engineering_management 15%
    }
    archetypes {
      high_performer 15%
      steady_contributor 55%
      new_hire 20%
      struggling 10%
    }
  }

  // ─── Projects ───────────────────────────────────

  project oncora {
    name "Oncora"
    type "drug"
    phase "clinical_trial_phase_3"
    teams [drug_discovery, clinical_development]
    timeline_start 2024-01
    timeline_end 2026-06
    prose_topic "oncology drug in Phase 3 clinical trials"
    prose_tone "technical, optimistic"
    milestones ["Phase 2 completion", "Phase 3 enrollment start", "Interim analysis", "NDA submission"]
    risks ["enrollment delays", "manufacturing scale-up", "regulatory feedback cycles"]
    technical_choices ["mAb platform", "companion diagnostic", "adaptive trial design"]
  }

  project molecularforge {
    name "MolecularForge"
    type "platform"
    teams [platform_engineering, data_science_ai]
    timeline_start 2023-06
    timeline_end 2026-12
    prose_topic "AI-powered drug discovery platform rewrite"
    prose_tone "technical"
    milestones ["v2 architecture design", "ML pipeline migration", "Beta launch", "GA release"]
    risks ["model accuracy regression", "data migration complexity", "API backward compatibility"]
    technical_choices ["PyTorch for ML inference", "graph database for molecular data", "gRPC API layer"]
  }

  project compliance_remediation {
    name "SOC2 Compliance Remediation"
    type "program"
    teams [security_compliance, cloud_infrastructure]
    timeline_start 2025-01
    timeline_end 2025-06
    prose_topic "SOC2 compliance remediation after audit findings"
    prose_tone "formal, urgent"
  }

  project datalake_v2 {
    name "DataLake v2"
    type "platform"
    teams [cloud_infrastructure, data_science_ai, platform_engineering]
    timeline_start 2024-06
    timeline_end 2026-03
    prose_topic "next-generation data lake migration to cloud-native architecture"
    prose_tone "technical"
  }

  project cross_func_initiative {
    name "One BioNova"
    type "program"
    teams [developer_experience, platform_engineering, process_engineering, digital_marketing]
    timeline_start 2025-04
    timeline_end 2025-12
    prose_topic "company-wide engineering culture and tooling unification"
    prose_tone "collaborative, strategic"
  }

  // ─── Scenarios ──────────────────────────────────

  snapshots {
    quarterly_from 2024-07
    quarterly_to 2026-01
    account_id "acct_bionova_001"
    comments_per_snapshot 25
    webhook_prose_cap 1000
  }

  scenario oncora_push {
    name "Oncora Drug Discovery Push"
    narrative "Drug discovery team ramps up for Phase 3 enrollment, requiring elevated code velocity and cross-team coordination with clinical development"
    timerange_start 2025-03
    timerange_end 2025-09

    affect drug_discovery {
      github_commits "spike"
      github_prs "elevated"
      dx_drivers {
        clear_direction  { trajectory "rising" magnitude 5 }
        learning_culture { trajectory "rising" magnitude 3 }
        connectedness    { trajectory "rising" magnitude 4 }
      }
      evidence_skills [data_integration, data_modeling]
      evidence_floor "working"
    }

    affect clinical_development {
      github_commits "elevated"
      github_prs "moderate"
      dx_drivers {
        clear_direction       { trajectory "rising" magnitude 4 }
        efficient_processes   { trajectory "rising" magnitude 3 }
        requirements_quality  { trajectory "rising" magnitude 2 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "foundational"
    }
  }

  scenario molecularforge_release {
    name "MolecularForge Major Release"
    narrative "Platform team pushes toward GA release of MolecularForge v2, with ML pipeline migration and API stabilization as critical path items"
    timerange_start 2025-06
    timerange_end 2025-12

    affect platform_engineering {
      github_commits "sustained_spike"
      github_prs "very_high"
      dx_drivers {
        deep_work           { trajectory "declining" magnitude -8 }
        managing_tech_debt  { trajectory "declining" magnitude -5 }
        ease_of_release     { trajectory "declining" magnitude -6 }
        code_review         { trajectory "declining" magnitude -3 }
      }
      evidence_skills [architecture_design, sre_practices]
      evidence_floor "practitioner"
    }
  }

  scenario compliance_audit {
    name "SOC2 Compliance Remediation"
    timerange_start 2025-01
    timerange_end 2025-06

    affect security_compliance {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        clear_direction     { trajectory "rising" magnitude 6 }
        documentation       { trajectory "rising" magnitude 5 }
        efficient_processes { trajectory "rising" magnitude 4 }
      }
      evidence_skills [sre_practices, cloud_platforms]
      evidence_floor "working"
    }

    affect cloud_infrastructure {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        managing_tech_debt { trajectory "rising" magnitude 3 }
        documentation      { trajectory "rising" magnitude 4 }
      }
      evidence_skills [cloud_platforms]
      evidence_floor "foundational"
    }

    affect quality_assurance {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        documentation       { trajectory "rising" magnitude 5 }
        efficient_processes { trajectory "rising" magnitude 4 }
      }
      evidence_skills [regulatory_compliance]
      evidence_floor "working"
    }

    affect regulatory_science {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        documentation { trajectory "rising" magnitude 4 }
      }
      evidence_skills [regulatory_compliance, stakeholder_management]
      evidence_floor "foundational"
    }

    affect enterprise_applications {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        managing_tech_debt { trajectory "rising" magnitude 3 }
      }
      evidence_skills [cloud_platforms]
      evidence_floor "foundational"
    }
  }

  scenario datalake_adoption {
    name "DataLake v2 Technology Adoption"
    timerange_start 2025-02
    timerange_end 2025-10

    affect data_science_ai {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        experimentation     { trajectory "rising" magnitude 5 }
        learning_culture    { trajectory "rising" magnitude 4 }
        codebase_experience { trajectory "rising" magnitude 3 }
      }
      evidence_skills [data_integration, data_modeling]
      evidence_floor "working"
    }

    affect cloud_infrastructure {
      github_commits "sustained_spike"
      github_prs "elevated"
      dx_drivers {
        ease_of_release    { trajectory "declining" magnitude -4 }
        deep_work          { trajectory "declining" magnitude -3 }
        managing_tech_debt { trajectory "rising" magnitude 2 }
      }
      evidence_skills [cloud_platforms, devops]
      evidence_floor "practitioner"
    }
  }

  scenario one_bionova {
    name "One BioNova Cross-Functional Initiative"
    timerange_start 2025-04
    timerange_end 2025-12

    affect developer_experience {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 6 }
        efficient_processes { trajectory "rising" magnitude 5 }
        learning_culture    { trajectory "rising" magnitude 4 }
      }
      evidence_skills [team_collaboration, technical_writing]
      evidence_floor "foundational"
    }

    affect platform_engineering {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "foundational"
    }

    affect process_engineering {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 5 }
        efficient_processes { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "awareness"
    }

    affect digital_marketing {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 4 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "awareness"
    }

    affect genomics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness    { trajectory "rising" magnitude 3 }
        learning_culture { trajectory "rising" magnitude 2 }
      }
      evidence_skills [data_integration]
      evidence_floor "working"
    }

    affect biostatistics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [data_modeling]
      evidence_floor "working"
    }

    affect supply_chain {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        efficient_processes { trajectory "rising" magnitude 4 }
        connectedness       { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "foundational"
    }

    affect manufacturing_it {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 4 }
        efficient_processes { trajectory "rising" magnitude 3 }
      }
      evidence_skills [cloud_platforms, team_collaboration]
      evidence_floor "foundational"
    }

    affect medical_affairs {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "awareness"
    }

    affect market_access {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "awareness"
    }

    affect field_operations {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 2 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "awareness"
    }

    affect customer_support {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "awareness"
    }

    affect commercial_analytics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 3 }
        learning_culture    { trajectory "rising" magnitude 2 }
      }
      evidence_skills [data_modeling, data_integration]
      evidence_floor "foundational"
    }
  }

  // ─── Standard (Pathway) ────────────────────────

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role_modeling, exemplifying]

    levels {
      J040 { title "Associate Engineer" rank 1 experience "0-2 years" }
      J060 { title "Engineer" rank 2 experience "2-4 years" }
      J070 { title "Senior Engineer" rank 3 experience "4-7 years" }
      J080 { title "Lead Engineer" rank 4 experience "7-10 years" }
      J090 { title "Staff Engineer" rank 5 experience "10-14 years" }
      J100 { title "Principal Engineer" rank 6 experience "14+ years" }
    }

    capabilities {
      delivery {
        name "Delivery"
        skills [data_integration, full_stack_development, problem_discovery, rapid_prototyping]
      }
      scale {
        name "Scale"
        skills [architecture_design, data_modeling, performance_optimization, cloud_platforms]
      }
      reliability {
        name "Reliability"
        skills [sre_practices, incident_management, observability, change_management]
      }
      business {
        name "Business"
        skills [stakeholder_management, product_thinking, regulatory_compliance, risk_management]
      }
      people {
        name "People"
        skills [team_collaboration, technical_writing, mentoring, code_review]
      }
    }

    behaviours {
      outcome_ownership { name "Own the Outcome" }
      systems_thinking { name "Think in Systems" }
      relentless_curiosity { name "Stay Relentlessly Curious" }
      precise_communication { name "Communicate with Precision" }
      polymathic_knowledge { name "Build Polymathic Knowledge" }
    }

    disciplines {
      software_engineering {
        roleTitle "Software Engineer"
        specialization "Software Engineering"
        core [architecture_design, code_review, full_stack_development]
        supporting [sre_practices, cloud_platforms]
        broad [data_modeling, stakeholder_management]
        validTracks [null, platform, sre]
      }
      data_engineering {
        roleTitle "Data Engineer"
        specialization "Data Engineering"
        core [data_integration, data_modeling, performance_optimization]
        supporting [architecture_design, cloud_platforms]
        broad [stakeholder_management, regulatory_compliance]
        validTracks [null, platform]
      }
      engineering_management {
        roleTitle "Engineering Manager"
        specialization "Engineering Management"
        isProfessional false
        core [stakeholder_management, team_collaboration, mentoring]
        supporting [product_thinking, risk_management]
        broad [architecture_design, incident_management]
        validTracks [null]
      }
      clinical_informatics {
        roleTitle "Clinical Informatics Engineer"
        specialization "Clinical Informatics"
        core [data_integration, regulatory_compliance, data_modeling]
        supporting [stakeholder_management, risk_management]
        broad [full_stack_development, observability]
        validTracks [null]
      }
      quality_engineering {
        roleTitle "Quality Engineer"
        specialization "Quality Engineering"
        core [observability, change_management, regulatory_compliance]
        supporting [sre_practices, incident_management]
        broad [code_review, technical_writing]
        validTracks [null, sre]
      }
    }

    tracks {
      platform { name "Platform Engineering" }
      sre { name "Site Reliability Engineering" }
      ml_ops { name "ML Operations" }
      security { name "Security Engineering" }
    }

    drivers {
      clear_direction {
        name "Clear Direction"
        skills [stakeholder_management, product_thinking]
        behaviours [outcome_ownership, precise_communication]
      }
      say_on_priorities {
        name "Say on Priorities"
        skills [stakeholder_management, risk_management]
        behaviours [outcome_ownership, systems_thinking]
      }
      requirements_quality {
        name "Requirements Quality"
        skills [problem_discovery, product_thinking]
        behaviours [precise_communication, relentless_curiosity]
      }
      ease_of_release {
        name "Ease of Release"
        skills [change_management, sre_practices]
        behaviours [systems_thinking, outcome_ownership]
      }
      test_efficiency {
        name "Test Efficiency"
        skills [observability, rapid_prototyping]
        behaviours [relentless_curiosity, systems_thinking]
      }
      managing_tech_debt {
        name "Managing Tech Debt"
        skills [architecture_design, code_review]
        behaviours [systems_thinking, polymathic_knowledge]
      }
      code_review {
        name "Code Review"
        skills [code_review, mentoring]
        behaviours [precise_communication, polymathic_knowledge]
      }
      documentation {
        name "Documentation"
        skills [technical_writing, regulatory_compliance]
        behaviours [precise_communication, polymathic_knowledge]
      }
      codebase_experience {
        name "Codebase Experience"
        skills [full_stack_development, architecture_design]
        behaviours [polymathic_knowledge, systems_thinking]
      }
      incident_response {
        name "Incident Response"
        skills [incident_management, sre_practices]
        behaviours [outcome_ownership, systems_thinking]
      }
      learning_culture {
        name "Learning Culture"
        skills [mentoring, technical_writing]
        behaviours [relentless_curiosity, polymathic_knowledge]
      }
      experimentation {
        name "Experimentation"
        skills [rapid_prototyping, data_modeling]
        behaviours [relentless_curiosity, outcome_ownership]
      }
      connectedness {
        name "Connectedness"
        skills [team_collaboration, stakeholder_management]
        behaviours [precise_communication, outcome_ownership]
      }
      efficient_processes {
        name "Efficient Processes"
        skills [change_management, performance_optimization]
        behaviours [systems_thinking, outcome_ownership]
      }
      deep_work {
        name "Deep Work"
        skills [architecture_design, data_integration]
        behaviours [relentless_curiosity, systems_thinking]
      }
      leveraging_user_feedback {
        name "Leveraging User Feedback"
        skills [product_thinking, problem_discovery]
        behaviours [relentless_curiosity, precise_communication]
      }
    }
  }

  // ─── Content Types ──────────────────────────────

  content guide_html {
    articles 4
    article_topics [clinical, data_ai, drug_discovery, manufacturing]
    blogs 45
    blog_topics {
      drug_discovery 30%
      platform_engineering 25%
      clinical_development 20%
      data_science 15%
      engineering_culture 10%
    }
    faqs 35
    howtos 2
    howto_topics [clinical_data, gmp_procedures]
    reviews 40
    comments 55
    courses 16
    events 8
  }

  content outpost_markdown {
    personas 5
    persona_levels [L1, L2, L3, L4, L5]
    briefings_per_persona 8
    notes_per_persona 15
  }

  // ─── Datasets ─────────────────────────────────

  dataset trial_patients {
    tool synthea
    population 200
    modules [diabetes, cardiovascular]
  }

  dataset claims {
    tool sdv
    metadata "schemas/bionova_claims_metadata.json"
    data {
      claims "data/bionova_claims_sample.csv"
    }
    rows 5000
  }

  dataset researchers {
    tool faker
    rows 100
    fields {
      id "string.uuid"
      name "person.fullName"
      email "internet.email"
      department "commerce.department"
      specialty "science.chemicalElement"
      joined "date.past"
    }
  }

  // ─── Clinical ──────────────────────────────────

  clinical {
    condition diabetes_t2 {
      name "Type 2 Diabetes Mellitus"
      icd10 ["E11", "E11.9"]
      synonyms ["high blood sugar", "adult-onset diabetes", "insulin resistance"]
      synthea_module diabetes
      severity chronic
      prose_topic "type 2 diabetes for patients considering clinical trials"
      prose_tone "empathetic, accessible"
    }

    condition hypertension {
      name "Essential Hypertension"
      icd10 [I10]
      synonyms ["high blood pressure", "elevated blood pressure"]
      synthea_module hypertension
      severity chronic
      prose_topic "hypertension and cardiovascular risk in clinical research"
      prose_tone "empathetic, accessible"
    }

    condition breast_cancer {
      name "Breast Cancer"
      icd10 ["C50", "C50.9"]
      synonyms ["breast malignancy", "breast tumor"]
      synthea_module breast_cancer
      severity acute
      prose_topic "breast cancer treatment options and clinical trials"
      prose_tone "supportive, clear"
    }

    condition lung_cancer {
      name "Non-Small Cell Lung Cancer"
      icd10 ["C34", "C34.9"]
      synonyms ["NSCLC", "lung tumor", "lung malignancy"]
      synthea_module lung_cancer
      severity acute
      prose_topic "NSCLC immunotherapy and targeted therapy trials"
      prose_tone "supportive, clear"
    }

    condition alzheimers {
      name "Alzheimer Disease"
      icd10 ["G30", "G30.9"]
      synonyms ["memory loss", "dementia", "cognitive decline"]
      synthea_module alzheimers
      severity chronic
      prose_topic "Alzheimer disease research and emerging therapies"
      prose_tone "compassionate, hopeful"
    }

    site cambridge {
      name "BioNova Cambridge Research Center"
      address "200 CambridgePark Drive"
      city "Cambridge"
      state "MA"
      country "US"
      org headquarters
      capacity 500
      specialties [oncology, endocrinology, neurology]
    }

    site houston {
      name "BioNova Houston Clinical Site"
      address "6550 Fannin Street"
      city "Houston"
      state "TX"
      country "US"
      org headquarters
      capacity 350
      specialties [oncology, cardiology]
    }

    site chicago {
      name "BioNova Chicago Research Institute"
      address "300 E Superior Street"
      city "Chicago"
      state "IL"
      country "US"
      org headquarters
      capacity 400
      specialties [neurology, endocrinology]
    }

    site london {
      name "BioNova London Clinical Centre"
      address "35 Red Lion Square"
      city "London"
      state "England"
      country "GB"
      org headquarters
      capacity 300
      specialties [oncology, neurology]
    }

    site tokyo {
      name "BioNova Tokyo Research Facility"
      address "1-7-1 Otemachi"
      city "Tokyo"
      state "Tokyo"
      country "JP"
      org headquarters
      capacity 250
      specialties [oncology, endocrinology]
    }

    trial oncora_p3 {
      name "ONCORA-301"
      protocol_id "BNV-ONC-2024-301"
      project oncora
      phase "phase_3"
      therapeutic_area "oncology"
      conditions [breast_cancer]
      sites [cambridge, houston, london]
      principal_investigator @chronos
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 450
      current_enrollment 287
      start_date 2024-06
      estimated_end_date 2026-06
      arms ["mAb + SoC", "placebo + SoC"]
      prose_topic "Phase 3 HER2+ breast cancer monoclonal antibody trial"
      prose_tone "clinical, accessible"
      criteria {
        inclusion {
          age_min 18
          age_max 75
          conditions_required ["breast_cancer"]
          ecog_max 2
          custom ["Histologically confirmed HER2+ breast cancer", "Measurable disease per RECIST 1.1", "Adequate organ function"]
        }
        exclusion {
          conditions_excluded ["active_autoimmune_disease"]
          active_autoimmune true
          prior_immunotherapy false
          custom ["Prior treatment with anti-HER2 therapy in metastatic setting", "Active CNS metastases", "History of cardiac events within 6 months"]
        }
      }
    }

    trial neuregen_p2 {
      name "NEUREGEN-201"
      protocol_id "BNV-NRG-2025-201"
      phase "phase_2"
      therapeutic_area "neurology"
      conditions [alzheimers]
      sites [cambridge, chicago, london, tokyo]
      principal_investigator @apollo
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 200
      current_enrollment 45
      start_date 2025-03
      estimated_end_date 2027-12
      arms ["Gene therapy low dose", "Gene therapy high dose", "placebo"]
      prose_topic "Phase 2 gene therapy for early Alzheimer disease"
      prose_tone "compassionate, scientific"
      criteria {
        inclusion {
          age_min 55
          age_max 85
          conditions_required ["alzheimers"]
          ecog_max 1
          custom ["Clinical diagnosis of mild-to-moderate Alzheimer disease", "MMSE score 16-26", "Stable on cholinesterase inhibitor for 3+ months"]
        }
        exclusion {
          conditions_excluded ["active_cancer", "uncontrolled_seizures"]
          active_autoimmune false
          prior_immunotherapy false
          custom ["Participation in another interventional trial within 30 days", "Known contraindication to lumbar puncture", "Severe hepatic impairment"]
        }
      }
    }

    trial diabex_p2 {
      name "DIABEX-201"
      protocol_id "BNV-DBX-2025-201"
      project oncora
      phase "phase_2"
      therapeutic_area "endocrinology"
      conditions [diabetes_t2, hypertension]
      sites [cambridge, chicago, houston, tokyo]
      principal_investigator @chronos
      sponsor "BioNova Therapeutics"
      status "active_not_recruiting"
      target_enrollment 300
      current_enrollment 298
      start_date 2024-01
      estimated_end_date 2026-03
      arms ["BNV-DX01 10mg", "BNV-DX01 25mg", "placebo"]
      prose_topic "Phase 2 dual GLP-1/GIP agonist for T2D with comorbid hypertension"
      prose_tone "clinical, encouraging"
      criteria {
        inclusion {
          age_min 30
          age_max 70
          conditions_required ["diabetes_t2"]
          ecog_max 1
          custom ["HbA1c between 7.0% and 10.5%", "BMI between 25 and 40", "On stable metformin dose for 3+ months"]
        }
        exclusion {
          conditions_excluded ["type_1_diabetes", "gestational_diabetes"]
          active_autoimmune false
          prior_immunotherapy false
          custom ["eGFR < 45 mL/min", "History of diabetic ketoacidosis", "Use of insulin within 3 months"]
        }
      }
    }

    trial lungshield_p1 {
      name "LUNGSHIELD-101"
      protocol_id "BNV-LS-2025-101"
      phase "phase_1"
      therapeutic_area "oncology"
      conditions [lung_cancer]
      sites [houston, tokyo]
      principal_investigator @thoth
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 60
      current_enrollment 12
      start_date 2025-06
      estimated_end_date 2027-06
      arms ["BNV-LS01 dose escalation"]
      prose_topic "Phase 1 bispecific antibody dose escalation for advanced NSCLC"
      prose_tone "clinical, precise"
      criteria {
        inclusion {
          age_min 18
          age_max 80
          conditions_required ["lung_cancer"]
          ecog_max 1
          custom ["Histologically confirmed NSCLC stage IIIB/IV", "At least one prior line of therapy", "Adequate bone marrow function"]
        }
        exclusion {
          conditions_excluded ["active_autoimmune_disease", "uncontrolled_infection"]
          active_autoimmune true
          prior_immunotherapy true
          custom ["Prior treatment with the same class of agent", "Symptomatic brain metastases", "Pregnancy or breastfeeding"]
        }
      }
    }
  }

  // ─── Outputs ──────────────────────────────────

  output trial_patients_patient json     { path "output/trial_patients.json" }
  output trial_patients_patient csv      { path "output/trial_patients.csv" }
  output trial_patients_condition json   { path "output/trial_conditions.json" }
  output claims_claims parquet           { path "output/claims.parquet" }
  output claims_claims sql               { path "output/claims.sql" table "bionova_claims" }
  output researchers yaml                { path "output/researchers.yaml" }
  output researchers markdown            { path "output/researchers.md" }

  output clinical_db supabase_migration {
    prefix "bn"
    path "output/"
    entities [clinical.conditions, clinical.sites, clinical.researchers, clinical.trials, clinical.criteria]
    include_embeddings true
  }

  output clinical_embed embeddings_jsonl {
    path "output/clinical_embeddings.jsonl"
    entities [clinical.conditions]
    text_fields {
      clinical.conditions [name, synonyms]
    }
  }
}

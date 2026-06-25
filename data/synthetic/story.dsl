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

    team drug-discovery {
      name "Drug Discovery Team"
      size 12
      manager @thoth
      repos ["oncology-pipelines", "cell-assay-lib", "molecular-screening"]
    }

    team clinical-development {
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

    team regulatory-science {
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

    director @zeus {
      name "Zeus"
      title "Director of Engineering"
      level J090
      discipline engineering-management
    }

    team platform-engineering {
      name "Platform Engineering Team"
      size 15
      manager @athena
      repos ["molecularforge", "data-lake-infra", "api-gateway"]
    }

    team data-science-ai {
      name "Data Science & AI Team"
      size 12
      manager @prometheus
      repos ["ml-pipeline", "prediction-models", "feature-store"]
    }

    team cloud-infrastructure {
      name "Cloud Infrastructure Team"
      size 10
      manager @hephaestus
      repos ["terraform-bionova", "k8s-configs", "monitoring-stack"]
    }

    team security-compliance {
      name "Security & Compliance Team"
      size 8
      manager @ares
      repos ["soc2-automation", "vulnerability-scanner"]
    }

    team enterprise-applications {
      name "Enterprise Applications Team"
      size 10
      manager @hermes
      repos ["erp-integrations", "identity-hub"]
    }

    team developer-experience {
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

    team process-engineering {
      name "Process Engineering Team"
      size 10
      manager @demeter
      repos ["batch-control", "gmp-workflow"]
    }

    team quality-assurance {
      name "Quality Assurance Team"
      size 10
      manager @astraea
      repos ["qa-automation", "capa-tracker"]
    }

    team supply-chain {
      name "Supply Chain Team"
      size 10
      manager @tyche
      repos ["supply-optimizer", "logistics-api"]
    }

    team manufacturing-it {
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

    team medical-affairs {
      name "Medical Affairs Team"
      size 8
      manager @asclepius
      repos ["medical-info-portal", "kol-tracker"]
    }

    team market-access {
      name "Market Access Team"
      size 8
      manager @plutus
      repos ["pricing-engine", "payer-analytics"]
    }

    team digital-marketing {
      name "Digital Marketing Team"
      size 10
      manager @aphrodite
      repos ["campaign-platform", "analytics-dashboard"]
    }

    team field-operations {
      name "Field Operations Team"
      size 10
      manager @artemis
      repos ["field-force-app", "territory-planner"]
    }

    team customer-support {
      name "Customer Support Team"
      size 8
      manager @hestia
      repos ["support-portal", "knowledge-base"]
    }

    team commercial-analytics {
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
      software-engineering 60%
      data-engineering 25%
      engineering-management 15%
    }
    archetypes {
      high-performer 15%
      steady-contributor 55%
      new-hire 20%
      struggling 10%
    }
  }

  // ─── Projects ───────────────────────────────────

  project oncora {
    name "Oncora"
    type "drug"
    phase "clinical_trial_phase_3"
    teams [drug-discovery, clinical-development]
    timeline_start 2024-01
    timeline_end 2026-06
    prose_topic "oncology drug in Phase 3 clinical trials"
    prose_tone "technical, optimistic"
    milestones ["Phase 2 completion", "Phase 3 enrollment start", "Interim analysis", "NDA submission"]
    risks ["enrollment delays", "manufacturing scale-up", "regulatory feedback cycles"]
    technical-choices ["mAb platform", "companion diagnostic", "adaptive trial design"]
  }

  project molecularforge {
    name "MolecularForge"
    type "platform"
    teams [platform-engineering, data-science-ai]
    timeline_start 2023-06
    timeline_end 2026-12
    prose_topic "AI-powered drug discovery platform rewrite"
    prose_tone "technical"
    milestones ["v2 architecture design", "ML pipeline migration", "Beta launch", "GA release"]
    risks ["model accuracy regression", "data migration complexity", "API backward compatibility"]
    technical-choices ["PyTorch for ML inference", "graph database for molecular data", "gRPC API layer"]
  }

  project compliance-remediation {
    name "SOC2 Compliance Remediation"
    type "program"
    teams [security-compliance, cloud-infrastructure]
    timeline_start 2025-01
    timeline_end 2025-06
    prose_topic "SOC2 compliance remediation after audit findings"
    prose_tone "formal, urgent"
  }

  project datalake-v2 {
    name "DataLake v2"
    type "platform"
    teams [cloud-infrastructure, data-science-ai, platform-engineering]
    timeline_start 2024-06
    timeline_end 2026-03
    prose_topic "next-generation data lake migration to cloud-native architecture"
    prose_tone "technical"
  }

  project cross-func-initiative {
    name "One BioNova"
    type "program"
    teams [developer-experience, platform-engineering, process-engineering, digital-marketing]
    timeline_start 2025-04
    timeline_end 2025-12
    prose_topic "company-wide engineering culture and tooling unification"
    prose_tone "collaborative, strategic"
  }

  project polaris {
    name "BioNova Polaris"
    type "application"
    teams [platform-engineering, developer-experience, clinical-development]
    timeline_start 2025-04
    timeline_end 2026-06
    prose_topic "patient-facing clinical trial search and matching application"
    prose_tone "technical, user-focused"
    milestones ["Data model design", "Search API MVP", "Embedding pipeline", "Patient matching GA"]
    risks ["embedding quality for medical terms", "regulatory review of patient-facing content", "Supabase migration coordination"]
    technical-choices ["Supabase for data and auth", "pgvector for semantic search", "Edge Functions for matching"]
  }

  project patient-portal {
    name "BioNova Patient Portal"
    type "application"
    teams [enterprise-applications, security-compliance, clinical-development]
    timeline_start 2025-06
    timeline_end 2026-09
    prose_topic "secure patient portal for trial enrollment and health record access"
    prose_tone "technical, compliance-focused"
    milestones ["Identity integration", "PHI access controls", "Enrollment workflow", "Audit trail GA"]
    risks ["HIPAA compliance gaps", "EHR integration complexity", "identity federation edge cases"]
    technical-choices ["OIDC for identity", "row-level security in Supabase", "FHIR R4 for EHR interop"]
  }

  project trial-management {
    name "BioNova Trial Management System"
    type "platform"
    teams [clinical-development, data-science-ai, platform-engineering]
    timeline_start 2025-03
    timeline_end 2026-12
    prose_topic "end-to-end clinical trial management and analytics platform"
    prose_tone "technical"
    milestones ["Trial registry import", "Site management module", "Enrollment analytics", "Regulatory submission export"]
    risks ["data migration from legacy CTMS", "multi-site enrollment sync", "audit trail completeness"]
    technical-choices ["event-sourced enrollment", "CDISC ODM for regulatory export", "real-time dashboards"]
  }

  // ─── Scenarios ──────────────────────────────────

  snapshots {
    quarterly_from 2024-07
    quarterly_to 2026-01
    account_id "acct_bionova_001"
    comments_per_snapshot 25
    webhook_prose_cap 1000
  }

  scenario oncora-push {
    name "Oncora Drug Discovery Push"
    narrative "Drug discovery team ramps up for Phase 3 enrollment, requiring elevated code velocity and cross-team coordination with clinical development"
    timerange_start 2025-03
    timerange_end 2025-09

    affect drug-discovery {
      github_commits "spike"
      github_prs "elevated"
      dx_drivers {
        clear-direction  { trajectory "rising" magnitude 5 }
        learning-culture { trajectory "rising" magnitude 3 }
        connectedness    { trajectory "rising" magnitude 4 }
      }
      evidence_skills [data-integration, data-modeling]
      evidence_floor "working"
    }

    affect clinical-development {
      github_commits "elevated"
      github_prs "moderate"
      dx_drivers {
        clear-direction       { trajectory "rising" magnitude 4 }
        efficient-processes   { trajectory "rising" magnitude 3 }
        requirements-quality  { trajectory "rising" magnitude 2 }
      }
      evidence_skills [stakeholder-management]
      evidence_floor "foundational"
    }
  }

  scenario molecularforge-release {
    name "MolecularForge Major Release"
    narrative "Platform team pushes toward GA release of MolecularForge v2, with ML pipeline migration and API stabilization as critical path items"
    timerange_start 2025-06
    timerange_end 2025-12

    affect platform-engineering {
      github_commits "sustained_spike"
      github_prs "very_high"
      dx_drivers {
        deep-work           { trajectory "declining" magnitude -8 }
        managing-tech-debt  { trajectory "declining" magnitude -5 }
        ease-of-release     { trajectory "declining" magnitude -6 }
        code-review         { trajectory "declining" magnitude -3 }
      }
      evidence_skills [architecture-design, sre-practices]
      evidence_floor "practitioner"
    }
  }

  scenario compliance-audit {
    name "SOC2 Compliance Remediation"
    timerange_start 2025-01
    timerange_end 2025-06

    affect security-compliance {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        clear-direction     { trajectory "rising" magnitude 6 }
        documentation       { trajectory "rising" magnitude 5 }
        efficient-processes { trajectory "rising" magnitude 4 }
      }
      evidence_skills [sre-practices, cloud-platforms]
      evidence_floor "working"
    }

    affect cloud-infrastructure {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        managing-tech-debt { trajectory "rising" magnitude 3 }
        documentation      { trajectory "rising" magnitude 4 }
      }
      evidence_skills [cloud-platforms]
      evidence_floor "foundational"
    }

    affect quality-assurance {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        documentation       { trajectory "rising" magnitude 5 }
        efficient-processes { trajectory "rising" magnitude 4 }
      }
      evidence_skills [regulatory-compliance]
      evidence_floor "working"
    }

    affect regulatory-science {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        documentation { trajectory "rising" magnitude 4 }
      }
      evidence_skills [regulatory-compliance, stakeholder-management]
      evidence_floor "foundational"
    }

    affect enterprise-applications {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        managing-tech-debt { trajectory "rising" magnitude 3 }
      }
      evidence_skills [cloud-platforms]
      evidence_floor "foundational"
    }
  }

  scenario datalake-adoption {
    name "DataLake v2 Technology Adoption"
    timerange_start 2025-02
    timerange_end 2025-10

    affect data-science-ai {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        experimentation     { trajectory "rising" magnitude 5 }
        learning-culture    { trajectory "rising" magnitude 4 }
        codebase-experience { trajectory "rising" magnitude 3 }
      }
      evidence_skills [data-integration, data-modeling]
      evidence_floor "working"
    }

    affect cloud-infrastructure {
      github_commits "sustained_spike"
      github_prs "elevated"
      dx_drivers {
        ease-of-release    { trajectory "declining" magnitude -4 }
        deep-work          { trajectory "declining" magnitude -3 }
        managing-tech-debt { trajectory "rising" magnitude 2 }
      }
      evidence_skills [cloud-platforms, devops]
      evidence_floor "practitioner"
    }
  }

  scenario one-bionova {
    name "One BioNova Cross-Functional Initiative"
    timerange_start 2025-04
    timerange_end 2025-12

    affect developer-experience {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 6 }
        efficient-processes { trajectory "rising" magnitude 5 }
        learning-culture    { trajectory "rising" magnitude 4 }
      }
      evidence_skills [team-collaboration, technical-writing]
      evidence_floor "foundational"
    }

    affect platform-engineering {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team-collaboration]
      evidence_floor "foundational"
    }

    affect process-engineering {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 5 }
        efficient-processes { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team-collaboration]
      evidence_floor "awareness"
    }

    affect digital-marketing {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 4 }
      }
      evidence_skills [stakeholder-management]
      evidence_floor "awareness"
    }

    affect genomics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness    { trajectory "rising" magnitude 3 }
        learning-culture { trajectory "rising" magnitude 2 }
      }
      evidence_skills [data-integration]
      evidence_floor "working"
    }

    affect biostatistics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [data-modeling]
      evidence_floor "working"
    }

    affect supply-chain {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        efficient-processes { trajectory "rising" magnitude 4 }
        connectedness       { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder-management]
      evidence_floor "foundational"
    }

    affect manufacturing-it {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 4 }
        efficient-processes { trajectory "rising" magnitude 3 }
      }
      evidence_skills [cloud-platforms, team-collaboration]
      evidence_floor "foundational"
    }

    affect medical-affairs {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder-management]
      evidence_floor "awareness"
    }

    affect market-access {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [stakeholder-management]
      evidence_floor "awareness"
    }

    affect field-operations {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 2 }
      }
      evidence_skills [team-collaboration]
      evidence_floor "awareness"
    }

    affect customer-support {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team-collaboration]
      evidence_floor "awareness"
    }

    affect commercial-analytics {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        connectedness       { trajectory "rising" magnitude 3 }
        learning-culture    { trajectory "rising" magnitude 2 }
      }
      evidence_skills [data-modeling, data-integration]
      evidence_floor "foundational"
    }
  }

  scenario polaris-mvp-push {
    name "Polaris MVP Push"
    narrative "Platform, DX, and clinical development teams sprint toward Polaris MVP, requiring elevated velocity on search API, embedding pipeline, and clinical data integration"
    timerange_start 2025-06
    timerange_end 2025-09

    affect platform-engineering {
      github_commits "sustained_spike"
      github_prs "very_high"
      dx_drivers {
        deep-work          { trajectory "declining" magnitude -6 }
        managing-tech-debt { trajectory "declining" magnitude -4 }
        ease-of-release    { trajectory "declining" magnitude -5 }
      }
      evidence_skills [architecture-design, data-integration]
      evidence_floor "practitioner"
    }

    affect developer-experience {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        efficient-processes { trajectory "rising" magnitude 4 }
        connectedness       { trajectory "rising" magnitude 3 }
      }
      evidence_skills [full-stack-development, technical-writing]
      evidence_floor "working"
    }

    affect clinical-development {
      github_commits "elevated"
      github_prs "moderate"
      dx_drivers {
        clear-direction      { trajectory "rising" magnitude 5 }
        requirements-quality { trajectory "rising" magnitude 4 }
      }
      evidence_skills [data-integration, stakeholder-management]
      evidence_floor "foundational"
    }
  }

  scenario polaris-ga-release {
    name "Polaris GA Release"
    narrative "Platform and DX teams stabilize Polaris for general availability, focusing on performance, security hardening, and production readiness"
    timerange_start 2025-10
    timerange_end 2026-03

    affect platform-engineering {
      github_commits "elevated"
      github_prs "elevated"
      dx_drivers {
        ease-of-release    { trajectory "rising" magnitude 5 }
        managing-tech-debt { trajectory "rising" magnitude 4 }
        code-review        { trajectory "rising" magnitude 3 }
      }
      evidence_skills [sre-practices, performance-optimization]
      evidence_floor "practitioner"
    }

    affect developer-experience {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        documentation       { trajectory "rising" magnitude 5 }
        efficient-processes { trajectory "rising" magnitude 3 }
      }
      evidence_skills [technical-writing, team-collaboration]
      evidence_floor "working"
    }
  }

  // ─── Standard (Pathway) ────────────────────────

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role-modeling, exemplifying]

    // Level titles must comply with the professionalTitle contract:
    // single capitalised rank word — see
    // https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions
    levels {
      J040 { title "Associate" rank 1 experience "0-2 years" }
      J060 { title "Mid" rank 2 experience "2-4 years" }
      J070 { title "Senior" rank 3 experience "4-7 years" }
      J080 { title "Staff" rank 4 experience "7-10 years" }
      J090 { title "Principal" rank 5 experience "10-14 years" }
      J100 { title "Distinguished" rank 6 experience "14+ years" }
    }

    capabilities {
      delivery {
        name "Delivery"
        skills [data-integration, full-stack-development, problem-discovery, rapid-prototyping]
      }
      scale {
        name "Scale"
        skills [architecture-design, data-modeling, performance-optimization, cloud-platforms]
      }
      reliability {
        name "Reliability"
        skills [sre-practices, incident-management, observability, change-management]
      }
      business {
        name "Business"
        skills [stakeholder-management, product-thinking, regulatory-compliance, risk-management]
      }
      people {
        name "People"
        skills [team-collaboration, technical-writing, mentoring, code-review]
      }
    }

    behaviours {
      outcome-ownership { name "Own the Outcome" }
      systems-thinking { name "Think in Systems" }
      relentless-curiosity { name "Stay Relentlessly Curious" }
      precise-communication { name "Communicate with Precision" }
      polymathic-knowledge { name "Build Polymathic Knowledge" }
    }

    disciplines {
      software-engineering {
        roleTitle "Software Engineer"
        specialization "Software Engineering"
        core [architecture-design, code-review, full-stack-development]
        supporting [sre-practices, cloud-platforms]
        broad [data-modeling, stakeholder-management]
        validTracks [null, platform, sre]
      }
      data-engineering {
        roleTitle "Data Engineer"
        specialization "Data Engineering"
        core [data-integration, data-modeling, performance-optimization]
        supporting [architecture-design, cloud-platforms]
        broad [stakeholder-management, regulatory-compliance]
        validTracks [null, platform]
      }
      engineering-management {
        roleTitle "Engineering Manager"
        specialization "Engineering Management"
        isProfessional false
        core [stakeholder-management, team-collaboration, mentoring]
        supporting [product-thinking, risk-management]
        broad [architecture-design, incident-management]
        validTracks [null]
      }
      clinical-informatics {
        roleTitle "Clinical Informatics Engineer"
        specialization "Clinical Informatics"
        core [data-integration, regulatory-compliance, data-modeling]
        supporting [stakeholder-management, risk-management]
        broad [full-stack-development, observability]
        validTracks [null]
      }
      quality-engineering {
        roleTitle "Quality Engineer"
        specialization "Quality Engineering"
        core [observability, change-management, regulatory-compliance]
        supporting [sre-practices, incident-management]
        broad [code-review, technical-writing]
        validTracks [null, sre]
      }
    }

    tracks {
      platform { name "Platform Engineering" }
      sre { name "Site Reliability Engineering" }
      ml-ops { name "ML Operations" }
      security { name "Security Engineering" }
    }

    drivers {
      clear-direction {
        name "Clear Direction"
        skills [stakeholder-management, product-thinking]
        behaviours [outcome-ownership, precise-communication]
      }
      say-on-priorities {
        name "Say on Priorities"
        skills [stakeholder-management, risk-management]
        behaviours [outcome-ownership, systems-thinking]
      }
      requirements-quality {
        name "Requirements Quality"
        skills [problem-discovery, product-thinking]
        behaviours [precise-communication, relentless-curiosity]
      }
      ease-of-release {
        name "Ease of Release"
        skills [change-management, sre-practices]
        behaviours [systems-thinking, outcome-ownership]
      }
      test-efficiency {
        name "Test Efficiency"
        skills [observability, rapid-prototyping]
        behaviours [relentless-curiosity, systems-thinking]
      }
      managing-tech-debt {
        name "Managing Tech Debt"
        skills [architecture-design, code-review]
        behaviours [systems-thinking, polymathic-knowledge]
      }
      code-review {
        name "Code Review"
        skills [code-review, mentoring]
        behaviours [precise-communication, polymathic-knowledge]
      }
      documentation {
        name "Documentation"
        skills [technical-writing, regulatory-compliance]
        behaviours [precise-communication, polymathic-knowledge]
      }
      codebase-experience {
        name "Codebase Experience"
        skills [full-stack-development, architecture-design]
        behaviours [polymathic-knowledge, systems-thinking]
      }
      incident-response {
        name "Incident Response"
        skills [incident-management, sre-practices]
        behaviours [outcome-ownership, systems-thinking]
      }
      learning-culture {
        name "Learning Culture"
        skills [mentoring, technical-writing]
        behaviours [relentless-curiosity, polymathic-knowledge]
      }
      experimentation {
        name "Experimentation"
        skills [rapid-prototyping, data-modeling]
        behaviours [relentless-curiosity, outcome-ownership]
      }
      connectedness {
        name "Connectedness"
        skills [team-collaboration, stakeholder-management]
        behaviours [precise-communication, outcome-ownership]
      }
      efficient-processes {
        name "Efficient Processes"
        skills [change-management, performance-optimization]
        behaviours [systems-thinking, outcome-ownership]
      }
      deep-work {
        name "Deep Work"
        skills [architecture-design, data-integration]
        behaviours [relentless-curiosity, systems-thinking]
      }
      leveraging-user-feedback {
        name "Leveraging User Feedback"
        skills [product-thinking, problem-discovery]
        behaviours [relentless-curiosity, precise-communication]
      }
    }
  }

  // ─── Content Types ──────────────────────────────

  content guide-html {
    articles 4
    article_topics [clinical, data-ai, drug-discovery, manufacturing]
    blogs 45
    blog-topics {
      drug-discovery 30%
      platform-engineering 25%
      clinical-development 20%
      data-science 15%
      engineering-culture 10%
    }
    faqs 35
    howtos 2
    howto_topics [clinical-data, gmp-procedures]
    reviews 40
    comments 55
    courses 16
    events 8
  }

  content outpost-markdown {
    personas 5
    persona_levels [L1, L2, L3, L4, L5]
    briefings_per_persona 8
    notes_per_persona 15
  }

  // ─── Datasets ─────────────────────────────────

  dataset trial-patients {
    tool synthea
    population 200
    conditions [lung-cancer, diabetes-t2, cardiovascular,
                breast-cancer, hypertension, copd]
  }

  dataset claims {
    tool sdv
    metadata "schemas/bionova_claims_metadata.json"
    data {
      claims "data/bionova_claims_sample.csv"
    }
    rows 5000
  }

  // ─── Clinical ──────────────────────────────────

  clinical {
    condition lung-cancer {
      name "Non-Small Cell Lung Cancer"
      icd10 ["C34", "C34.9"]
      synonyms ["NSCLC", "lung tumor", "lung malignancy"]
      synthea_module lung-cancer
      severity acute
      prose_topic "NSCLC immunotherapy and targeted therapy trials"
      prose_tone "supportive, clear"
    }

    condition diabetes-t2 {
      name "Type 2 Diabetes Mellitus"
      icd10 ["E11", "E11.9"]
      synonyms ["high blood sugar", "adult-onset diabetes", "insulin resistance"]
      synthea_module diabetes
      severity chronic
      prose_topic "type 2 diabetes for patients considering clinical trials"
      prose_tone "empathetic, accessible"
    }

    condition cardiovascular {
      name "Cardiovascular Disease"
      icd10 ["I25", "I25.1"]
      synonyms ["heart disease", "coronary artery disease", "ischemic heart disease"]
      synthea_module cardiovascular-disease
      severity chronic
      prose_topic "cardiovascular disease risk factors and intervention trials"
      prose_tone "empathetic, accessible"
    }

    condition breast-cancer {
      name "HER2-Positive Breast Cancer"
      icd10 ["C50", "C50.9"]
      synonyms ["HER2+ breast cancer", "breast malignancy", "breast tumor"]
      synthea_module breast-cancer
      severity acute
      prose_topic "HER2-positive breast cancer targeted therapy and clinical trials"
      prose_tone "supportive, clear"
    }

    condition hypertension {
      name "Hypertension"
      icd10 [I10]
      synonyms ["high blood pressure", "elevated blood pressure"]
      synthea_module hypertension
      severity chronic
      prose_topic "hypertension and cardiovascular risk in clinical research"
      prose_tone "empathetic, accessible"
    }

    condition copd {
      name "Chronic Obstructive Pulmonary Disease"
      icd10 ["J44", "J44.1"]
      synonyms ["COPD", "chronic bronchitis", "emphysema"]
      synthea_module copd
      severity chronic
      prose_topic "COPD management and inhaler therapy clinical trials"
      prose_tone "empathetic, accessible"
    }

    site cambridge {
      name "BioNova Cambridge Main Campus"
      address "200 CambridgePark Drive"
      city "Cambridge"
      state "MA"
      country "US"
      org headquarters
      capacity 500
      specialties [oncology, endocrinology, cardiology]
    }

    site boston {
      name "BioNova Boston Clinical Center"
      address "75 Francis Street"
      city "Boston"
      state "MA"
      country "US"
      org headquarters
      capacity 200
      specialties [oncology, pulmonology]
    }

    site new-york {
      name "BioNova New York Satellite"
      address "525 East 68th Street"
      city "New York"
      state "NY"
      country "US"
      org headquarters
      capacity 300
      specialties [cardiology, endocrinology]
    }

    site chicago {
      name "BioNova Chicago Research Institute"
      address "300 E Superior Street"
      city "Chicago"
      state "IL"
      country "US"
      org headquarters
      capacity 250
      specialties [oncology, cardiology]
    }

    site san-francisco {
      name "BioNova San Francisco Trials Center"
      address "505 Parnassus Avenue"
      city "San Francisco"
      state "CA"
      country "US"
      org headquarters
      capacity 150
      specialties [pulmonology, endocrinology]
    }

    trial oncora-phase3 {
      name "ONCORA-301"
      protocol_id "BNV-ONC-2024-301"
      project oncora
      phase "Phase 3"
      therapeutic_area "oncology"
      conditions [lung-cancer]
      sites [cambridge, boston, chicago]
      principal_investigator @thoth
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 450
      current_enrollment 287
      start_date 2024-06
      estimated_end_date 2026-06
      arms ["mAb + SoC", "placebo + SoC"]
      prose_topic "Phase 3 NSCLC monoclonal antibody combination trial"
      prose_tone "clinical, accessible"
      criteria {
        inclusion {
          age_min 18
          age_max 75
          conditions_required ["lung_cancer"]
          ecog_max 2
          custom ["Histologically confirmed NSCLC stage IIIB/IV", "Measurable disease per RECIST 1.1", "Adequate organ function"]
        }
        exclusion {
          conditions_excluded ["active_autoimmune_disease"]
          active_autoimmune true
          prior_immunotherapy false
          custom ["Prior anti-PD-1/PD-L1 therapy within 6 months", "Active CNS metastases", "History of cardiac events within 6 months"]
        }
      }
    }

    trial oncora-phase1 {
      name "ONCORA-101"
      protocol_id "BNV-ONC-2025-101"
      project oncora
      phase "Phase 1"
      therapeutic_area "oncology"
      conditions [lung-cancer]
      sites [cambridge, boston]
      principal_investigator @thoth
      sponsor "BioNova Therapeutics"
      status "completed"
      target_enrollment 60
      current_enrollment 60
      start_date 2023-01
      estimated_end_date 2024-12
      arms ["BNV-ONC01 dose escalation"]
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
          custom ["Prior treatment with bispecific antibodies", "Symptomatic brain metastases", "Pregnancy or breastfeeding"]
        }
      }
    }

    trial cardio-outcomes {
      name "CARDIO-301"
      protocol_id "BNV-CRD-2024-301"
      phase "Phase 3"
      therapeutic_area "cardiology"
      conditions [cardiovascular, hypertension]
      sites [cambridge, new-york, chicago]
      principal_investigator @chronos
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 600
      current_enrollment 342
      start_date 2024-03
      estimated_end_date 2027-03
      arms ["BNV-CRD01 10mg", "BNV-CRD01 25mg", "placebo"]
      prose_topic "Phase 3 cardiovascular outcomes trial for combined CVD and hypertension"
      prose_tone "clinical, encouraging"
      criteria {
        inclusion {
          age_min 40
          age_max 80
          conditions_required ["cardiovascular"]
          ecog_max 2
          custom ["Documented coronary artery disease or equivalent risk", "Systolic BP above 140 mmHg on stable therapy", "LDL-C above 70 mg/dL"]
        }
        exclusion {
          conditions_excluded ["heart_failure_nyha_iv", "recent_stroke"]
          active_autoimmune false
          prior_immunotherapy false
          custom ["eGFR below 30 mL/min", "Planned coronary intervention within 3 months", "Uncontrolled atrial fibrillation"]
        }
      }
    }

    trial diabetes-prevention {
      name "DIABPREV-201"
      protocol_id "BNV-DBX-2024-201"
      phase "Phase 2"
      therapeutic_area "endocrinology"
      conditions [diabetes-t2]
      sites [cambridge, new-york, chicago, san-francisco]
      principal_investigator @hygieia
      sponsor "BioNova Therapeutics"
      status "active_not_recruiting"
      target_enrollment 300
      current_enrollment 298
      start_date 2024-01
      estimated_end_date 2026-03
      arms ["BNV-DX01 10mg", "BNV-DX01 25mg", "placebo"]
      prose_topic "Phase 2 dual GLP-1/GIP agonist for T2D prevention in high-risk adults"
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
          custom ["eGFR below 45 mL/min", "History of diabetic ketoacidosis", "Use of insulin within 3 months"]
        }
      }
    }

    trial her2-combo {
      name "HER2COMBO-201"
      protocol_id "BNV-HER-2025-201"
      phase "Phase 2"
      therapeutic_area "oncology"
      conditions [breast-cancer]
      sites [cambridge, boston, new-york]
      principal_investigator @asclepius
      sponsor "BioNova Therapeutics"
      status "recruiting"
      target_enrollment 200
      current_enrollment 45
      start_date 2025-03
      estimated_end_date 2027-06
      arms ["BNV-HER01 + trastuzumab", "trastuzumab + SoC"]
      prose_topic "Phase 2 HER2-positive breast cancer combination immunotherapy trial"
      prose_tone "supportive, clinical"
      criteria {
        inclusion {
          age_min 18
          age_max 75
          conditions_required ["breast_cancer"]
          ecog_max 2
          custom ["Histologically confirmed HER2-positive breast cancer", "Measurable disease per RECIST 1.1", "Adequate cardiac function (LVEF above 50%)"]
        }
        exclusion {
          conditions_excluded ["active_autoimmune_disease"]
          active_autoimmune true
          prior_immunotherapy false
          custom ["Prior treatment with anti-HER2 ADC in metastatic setting", "Active CNS metastases", "History of cardiac events within 6 months"]
        }
      }
    }

    trial copd-inhaler {
      name "BREATHE-101"
      protocol_id "BNV-CPD-2025-101"
      phase "Phase 1"
      therapeutic_area "pulmonology"
      conditions [copd]
      sites [boston, san-francisco]
      principal_investigator @apollo
      sponsor "BioNova Therapeutics"
      status "not_yet_recruiting"
      target_enrollment 80
      current_enrollment 0
      start_date 2025-09
      estimated_end_date 2027-03
      arms ["BNV-CPD01 low dose", "BNV-CPD01 high dose", "placebo"]
      prose_topic "Phase 1 novel inhaled biologic for moderate-to-severe COPD"
      prose_tone "clinical, precise"
      criteria {
        inclusion {
          age_min 40
          age_max 80
          conditions_required ["copd"]
          ecog_max 2
          custom ["FEV1 between 30% and 70% predicted", "At least one exacerbation in past 12 months", "Current or former smoker with 10+ pack-year history"]
        }
        exclusion {
          conditions_excluded ["active_asthma", "lung_cancer"]
          active_autoimmune false
          prior_immunotherapy false
          custom ["Supplemental oxygen use above 4 L/min", "Active respiratory infection within 4 weeks", "Prior lung transplant or volume reduction surgery"]
        }
      }
    }

    content {
      condition_explainers per_condition
      therapy_descriptions 6
      therapy_topics [mab-therapy, immunotherapy, targeted-therapy,
                      chemotherapy, radiation, clinical-trials-101]
      trial_faqs per_trial
      consent_summaries per_trial
      site_descriptions per_site
      patient_stories 10
      patient_story_conditions [lung-cancer, diabetes-t2,
                                cardiovascular, breast-cancer]
    }
  }

  // ─── Outputs ──────────────────────────────────

  output trial-patients-patient json     { path "output/trial_patients.json" }
  output trial-patients-patient csv      { path "output/trial_patients.csv" }
  output trial-patients-condition json   { path "output/trial_conditions.json" }
  output claims-claims parquet           { path "output/claims.parquet" }
  output claims-claims sql               { path "output/claims.sql" table "bionova_claims" }
  output polaris-seed supabase_migration {
    path "products/polaris/site/supabase/migrations/"
    prefix "seed"
    entities [clinical.conditions, clinical.sites,
              clinical.researchers, clinical.trials, clinical.criteria]
    include_embeddings true
  }

  output polaris-embeddings embeddings_jsonl {
    path "products/polaris/site/supabase/migrations/seed_embeddings.jsonl"
    entities [clinical.conditions, clinical.trials]
    text_fields {
      clinical.conditions [name, synonyms, prose-explainer]
      clinical.trials [name, arms, prose-description]
    }
  }
}

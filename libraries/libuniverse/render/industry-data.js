/**
 * Industry Data — drug and platform definitions for synthetic knowledge graph.
 *
 * Provides deterministic drug pipeline and technology platform data
 * parameterized by the universe's industry and domain.
 *
 * @module libuniverse/render/industry-data
 */

/**
 * @typedef {object} Drug
 * @property {string} id
 * @property {string} name
 * @property {string} drugClass
 * @property {string} activeIngredient
 * @property {string} clinicalPharmacology
 * @property {string} phase
 * @property {string} legalStatus
 * @property {string|null} parentDrug - id of parent drug for derivatives
 */

/**
 * @typedef {object} Platform
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string} version
 * @property {string[]} dependencies - ids of dependency platforms
 */

/**
 * Generate drug pipeline data.
 * @param {string} domain
 * @returns {Drug[]}
 */
export function generateDrugs(domain) {
  return [
    {
      id: 'oncora',
      name: 'Oncora',
      drugClass: 'Monoclonal Antibody',
      activeIngredient: 'Oncorizumab',
      clinicalPharmacology: 'Selective inhibition of PD-L1 checkpoint pathway in solid tumors',
      phase: 'clinical_trial_phase_3',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/oncora`,
    },
    {
      id: 'oncora-sc',
      name: 'Oncora SC',
      drugClass: 'Monoclonal Antibody',
      activeIngredient: 'Oncorizumab (subcutaneous)',
      clinicalPharmacology: 'Subcutaneous formulation of Oncorizumab for improved patient compliance',
      phase: 'clinical_trial_phase_1',
      legalStatus: 'Investigational New Drug',
      parentDrug: 'oncora',
      iri: `https://${domain}/id/drug/oncora-sc`,
    },
    {
      id: 'neuralink-7',
      name: 'NeuraLink-7',
      drugClass: 'Small Molecule',
      activeIngredient: 'Neuralixib',
      clinicalPharmacology: 'BACE1 inhibitor targeting amyloid-beta aggregation in neurodegenerative disease',
      phase: 'clinical_trial_phase_2',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/neuralink-7`,
    },
    {
      id: 'cardioguard',
      name: 'CardioGuard',
      drugClass: 'Peptide Therapeutic',
      activeIngredient: 'Cardioptide',
      clinicalPharmacology: 'Natriuretic peptide analog for chronic heart failure management',
      phase: 'clinical_trial_phase_2',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/cardioguard`,
    },
    {
      id: 'immunex-pro',
      name: 'ImmuneX Pro',
      drugClass: 'CAR-T Cell Therapy',
      activeIngredient: 'Autologous anti-CD19 CAR-T cells',
      clinicalPharmacology: 'Chimeric antigen receptor T-cell therapy for B-cell lymphomas',
      phase: 'clinical_trial_phase_3',
      legalStatus: 'Breakthrough Therapy Designation',
      parentDrug: null,
      iri: `https://${domain}/id/drug/immunex-pro`,
    },
    {
      id: 'genova-rna',
      name: 'Genova RNA',
      drugClass: 'mRNA Therapeutic',
      activeIngredient: 'mRNA-encoded IL-12',
      clinicalPharmacology: 'Intratumoral mRNA encoding interleukin-12 for immune activation',
      phase: 'preclinical',
      legalStatus: 'Pre-IND',
      parentDrug: null,
      iri: `https://${domain}/id/drug/genova-rna`,
    },
    {
      id: 'hepaclean',
      name: 'HepaClean',
      drugClass: 'Antisense Oligonucleotide',
      activeIngredient: 'Hepatisiran',
      clinicalPharmacology: 'Hepatocyte-targeted ASO for NASH fibrosis reduction',
      phase: 'clinical_trial_phase_1',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/hepaclean`,
    },
    {
      id: 'dermashield',
      name: 'DermaShield',
      drugClass: 'Biologic',
      activeIngredient: 'Dermazolimab',
      clinicalPharmacology: 'IL-17A/F dual inhibitor for moderate-to-severe psoriasis',
      phase: 'clinical_trial_phase_2',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/dermashield`,
    },
    {
      id: 'pulmofix',
      name: 'PulmoFix',
      drugClass: 'Inhaled Biologic',
      activeIngredient: 'Pulmozimab',
      clinicalPharmacology: 'Inhaled anti-TSLP antibody fragment for severe asthma',
      phase: 'clinical_trial_phase_1',
      legalStatus: 'Investigational New Drug',
      parentDrug: null,
      iri: `https://${domain}/id/drug/pulmofix`,
    },
    {
      id: 'oncora-combo',
      name: 'Oncora Combo',
      drugClass: 'Combination Therapy',
      activeIngredient: 'Oncorizumab + Neuralixib',
      clinicalPharmacology: 'Combination checkpoint inhibitor and kinase inhibitor for resistant tumors',
      phase: 'preclinical',
      legalStatus: 'Pre-IND',
      parentDrug: 'oncora',
      iri: `https://${domain}/id/drug/oncora-combo`,
    },
  ]
}

/**
 * Generate technology platform data as a DAG (no cycles).
 * @param {string} domain
 * @returns {Platform[]}
 */
export function generatePlatforms(domain) {
  return [
    // Foundation layer (no dependencies)
    {
      id: 'cloud-core',
      name: 'CloudCore',
      description: 'Core cloud infrastructure services and IAM',
      category: 'Infrastructure',
      version: '3.2.0',
      dependencies: [],
      iri: `https://${domain}/id/platform/cloud-core`,
    },
    {
      id: 'data-mesh',
      name: 'DataMesh',
      description: 'Enterprise data mesh fabric for cross-domain data sharing',
      category: 'Data Infrastructure',
      version: '2.1.0',
      dependencies: ['cloud-core'],
      iri: `https://${domain}/id/platform/data-mesh`,
    },
    {
      id: 'identity-hub',
      name: 'IdentityHub',
      description: 'Centralized identity and access management platform',
      category: 'Security',
      version: '4.0.1',
      dependencies: ['cloud-core'],
      iri: `https://${domain}/id/platform/identity-hub`,
    },
    {
      id: 'event-bus',
      name: 'EventBus',
      description: 'Enterprise event streaming and message broker',
      category: 'Middleware',
      version: '2.5.0',
      dependencies: ['cloud-core'],
      iri: `https://${domain}/id/platform/event-bus`,
    },
    // Mid layer
    {
      id: 'molecularforge',
      name: 'MolecularForge',
      description: 'AI-powered molecular simulation and drug candidate screening',
      category: 'Drug Discovery',
      version: '5.1.0',
      dependencies: ['data-mesh', 'cloud-core'],
      iri: `https://${domain}/id/platform/molecularforge`,
    },
    {
      id: 'genomics-pipeline',
      name: 'GenomicsPipeline',
      description: 'High-throughput genomic sequencing and variant analysis pipeline',
      category: 'Genomics',
      version: '3.0.2',
      dependencies: ['data-mesh', 'cloud-core'],
      iri: `https://${domain}/id/platform/genomics-pipeline`,
    },
    {
      id: 'clinical-stream',
      name: 'ClinicalStream',
      description: 'Real-time clinical trial data ingestion and monitoring',
      category: 'Clinical',
      version: '2.3.0',
      dependencies: ['data-mesh', 'event-bus'],
      iri: `https://${domain}/id/platform/clinical-stream`,
    },
    {
      id: 'stat-engine',
      name: 'StatEngine',
      description: 'Biostatistics computation engine for trial analysis',
      category: 'Analytics',
      version: '4.2.1',
      dependencies: ['data-mesh'],
      iri: `https://${domain}/id/platform/stat-engine`,
    },
    {
      id: 'ml-pipeline',
      name: 'MLPipeline',
      description: 'End-to-end machine learning model training and deployment',
      category: 'AI/ML',
      version: '3.4.0',
      dependencies: ['data-mesh', 'cloud-core'],
      iri: `https://${domain}/id/platform/ml-pipeline`,
    },
    {
      id: 'compliance-tracker',
      name: 'ComplianceTracker',
      description: 'Regulatory compliance monitoring and audit trail system',
      category: 'Regulatory',
      version: '2.0.3',
      dependencies: ['identity-hub', 'event-bus'],
      iri: `https://${domain}/id/platform/compliance-tracker`,
    },
    {
      id: 'api-gateway',
      name: 'APIGateway',
      description: 'Centralized API management, rate limiting, and routing',
      category: 'Infrastructure',
      version: '3.1.0',
      dependencies: ['cloud-core', 'identity-hub'],
      iri: `https://${domain}/id/platform/api-gateway`,
    },
    {
      id: 'dev-portal',
      name: 'DevPortal',
      description: 'Developer documentation, SDK distribution, and API playground',
      category: 'Developer Tools',
      version: '2.2.0',
      dependencies: ['api-gateway', 'identity-hub'],
      iri: `https://${domain}/id/platform/dev-portal`,
    },
    // Upper layer
    {
      id: 'trial-manager',
      name: 'TrialManager',
      description: 'End-to-end clinical trial management and patient enrollment',
      category: 'Clinical',
      version: '3.5.0',
      dependencies: ['clinical-stream', 'compliance-tracker', 'stat-engine'],
      iri: `https://${domain}/id/platform/trial-manager`,
    },
    {
      id: 'drug-safety',
      name: 'DrugSafety',
      description: 'Pharmacovigilance and adverse event reporting system',
      category: 'Safety',
      version: '2.1.0',
      dependencies: ['clinical-stream', 'compliance-tracker', 'event-bus'],
      iri: `https://${domain}/id/platform/drug-safety`,
    },
    {
      id: 'feature-store',
      name: 'FeatureStore',
      description: 'Centralized ML feature registry and serving infrastructure',
      category: 'AI/ML',
      version: '1.8.0',
      dependencies: ['ml-pipeline', 'data-mesh'],
      iri: `https://${domain}/id/platform/feature-store`,
    },
    {
      id: 'prediction-models',
      name: 'PredictionModels',
      description: 'Pre-trained biomarker prediction and patient stratification models',
      category: 'AI/ML',
      version: '2.0.0',
      dependencies: ['ml-pipeline', 'feature-store'],
      iri: `https://${domain}/id/platform/prediction-models`,
    },
    {
      id: 'batch-control',
      name: 'BatchControl',
      description: 'GMP batch manufacturing execution and process control',
      category: 'Manufacturing',
      version: '4.1.0',
      dependencies: ['event-bus', 'compliance-tracker'],
      iri: `https://${domain}/id/platform/batch-control`,
    },
    {
      id: 'supply-optimizer',
      name: 'SupplyOptimizer',
      description: 'Supply chain optimization and demand forecasting',
      category: 'Manufacturing',
      version: '2.3.0',
      dependencies: ['data-mesh', 'prediction-models'],
      iri: `https://${domain}/id/platform/supply-optimizer`,
    },
    {
      id: 'qa-automation',
      name: 'QAAutomation',
      description: 'Automated quality testing and validation framework',
      category: 'Quality',
      version: '3.0.0',
      dependencies: ['batch-control', 'compliance-tracker'],
      iri: `https://${domain}/id/platform/qa-automation`,
    },
    {
      id: 'medical-info-portal',
      name: 'MedicalInfoPortal',
      description: 'Medical information management and HCP inquiry response',
      category: 'Commercial',
      version: '2.4.0',
      dependencies: ['api-gateway', 'identity-hub'],
      iri: `https://${domain}/id/platform/medical-info-portal`,
    },
    {
      id: 'campaign-platform',
      name: 'CampaignPlatform',
      description: 'Digital marketing campaign management and analytics',
      category: 'Commercial',
      version: '3.2.0',
      dependencies: ['api-gateway', 'data-mesh'],
      iri: `https://${domain}/id/platform/campaign-platform`,
    },
    {
      id: 'ci-cd-platform',
      name: 'CICDPlatform',
      description: 'Continuous integration and deployment pipeline orchestration',
      category: 'Developer Tools',
      version: '5.0.0',
      dependencies: ['cloud-core', 'identity-hub'],
      iri: `https://${domain}/id/platform/ci-cd-platform`,
    },
    {
      id: 'monitoring-stack',
      name: 'MonitoringStack',
      description: 'Centralized observability, alerting, and SLO management',
      category: 'Operations',
      version: '3.3.0',
      dependencies: ['cloud-core', 'event-bus'],
      iri: `https://${domain}/id/platform/monitoring-stack`,
    },
    {
      id: 'k8s-platform',
      name: 'K8sPlatform',
      description: 'Kubernetes orchestration and container management',
      category: 'Infrastructure',
      version: '2.8.0',
      dependencies: ['cloud-core', 'monitoring-stack'],
      iri: `https://${domain}/id/platform/k8s-platform`,
    },
    {
      id: 'data-lake',
      name: 'DataLake',
      description: 'Cloud-native data lake with schema evolution and governance',
      category: 'Data Infrastructure',
      version: '2.0.0',
      dependencies: ['data-mesh', 'cloud-core', 'compliance-tracker'],
      iri: `https://${domain}/id/platform/data-lake`,
    },
    {
      id: 'variant-caller',
      name: 'VariantCaller',
      description: 'Genomic variant calling and annotation service',
      category: 'Genomics',
      version: '2.1.0',
      dependencies: ['genomics-pipeline', 'ml-pipeline'],
      iri: `https://${domain}/id/platform/variant-caller`,
    },
    {
      id: 'real-world-evidence',
      name: 'RealWorldEvidence',
      description: 'Real-world data collection and evidence generation platform',
      category: 'Clinical',
      version: '1.5.0',
      dependencies: ['data-lake', 'clinical-stream', 'stat-engine'],
      iri: `https://${domain}/id/platform/real-world-evidence`,
    },
    {
      id: 'submission-portal',
      name: 'SubmissionPortal',
      description: 'Regulatory submission document assembly and eCTD publishing',
      category: 'Regulatory',
      version: '3.0.0',
      dependencies: ['compliance-tracker', 'trial-manager'],
      iri: `https://${domain}/id/platform/submission-portal`,
    },
  ]
}

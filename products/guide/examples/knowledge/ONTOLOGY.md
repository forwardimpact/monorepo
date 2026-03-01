# BioNova Schema Definitions

Define SHACL shapes for a pharmaceutical company dataset with 500-600 entities.

## Critical Stable Identifiers

These specific subjects MUST appear consistently in generated content for
evaluation scenarios:

**People**: Apollo (CEO), Zeus (Chief Scientific Officer/CSO), Minerva
(Director, BioNova R&D), Hephaestus (Director, BioNova Manufacturing), Rhea
(Director, BioNova Commercial), Gaia (CTO/Director, BioNova IT), Thoth
(Principal Scientist, Drug Discovery Team Lead), Chronos (Senior Scientist),
Demeter (Manufacturing Manager), Athena (Senior Scientist)

**Organizations**: BioNova (HQ), BioNova R&D, BioNova Manufacturing, BioNova
Commercial, BioNova IT, Drug Discovery Team

**Projects**: Alpha, Beta, Gamma, Delta, Epsilon, Zeta

**Drugs**: Oncora (oncology), Cardiozen (cardiovascular), Immunex
(immunotherapy), Immunex-Plus (combination therapy requiring Immunex +
Cardiozen)

**Platforms**: MolecularForge (AI drug discovery), ClinicalStream (trial
management), BioAnalyzer (lab data), ProcessControl (manufacturing),
ManufacturingOS (depends on ProcessControl + BioAnalyzer)

**Events**: GMP Training

**Courses**: "Regulatory Affairs and FDA Submissions" (advanced course),
"Manufacturing Excellence" (certification track), courses with GMP compliance
content

**Policies**: Master Quality Management System Policy (top-level), Clinical
Trial Policy (cites master policy), policies covering FDA, GMP, HIPAA, ICH-GCP
compliance

**Key Relationships**:

- Zeus (CSO) manages department directors: Minerva, Hephaestus, Rhea, Gaia
- Thoth leads Drug Discovery Team (within BioNova R&D)
- Drug Discovery Team uses MolecularForge platform
- Demeter manages team within Manufacturing
- ManufacturingOS depends on ProcessControl AND BioAnalyzer
- Immunex-Plus development requires Oncora completion
- Manufacturing personnel attend GMP Training events

## Entity Types and Properties

### People (Person)

- Properties: name, job title, works for
- Works for links to Organizations (bidirectional with member/employee)
- 211 instances total
- **Leadership**: Apollo (CEO), Zeus (Chief Scientific Officer/CSO)
- **R&D Directors**: Minerva (Director, BioNova R&D), Thoth (Principal
  Scientist, Drug Discovery Team Lead)
- **Department Directors**: Hephaestus (Director, BioNova Manufacturing), Rhea
  (Director, BioNova Commercial), Gaia (CTO/Director, BioNova IT)
- **Senior Scientists**: Chronos (Senior Scientist), Athena (Senior Scientist),
  Pontus, Thalassa
- **Management**: Demeter (Manufacturing Manager)
- **External Collaborators**: Emily Stone, Maya Singh, Alex Chen, Maria Garcia,
  Oliver Smith

### Organizations (Organization)

- Properties: name, member, employee, parent organization, sub-organization
- Member and employee link to People (bidirectional with works for)
- Parent organization links to Organizations (bidirectional with
  sub-organization)
- 44 instances
- **Company**: BioNova (HQ)
- **Departments**: BioNova R&D, BioNova Manufacturing, BioNova Commercial,
  BioNova IT
- **R&D Teams**: Drug Discovery Team, Clinical Development Team, Clinical Ops,
  Clinical Pharmacology, Genomics
- **IT Teams**: Data Science AI Team, Platform Engineering Team, Cloud
  Infrastructure Team, IT Operations Team
- **Manufacturing Teams**: Production Team, Quality Assurance Team
- **Commercial Teams**: Sales Team, Marketing Team, Market Access Team
- **Support Functions**: Ethics Board, Governance, Medical Affairs, Regulatory,
  Safety

### Projects (Project)

- Properties: name
- 14 instances
- **Greek Letter Projects**: Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Eta,
  Theta, Iota, Kappa, Lambda, Mu
- **Strategic Initiatives**: Immunotherapy, Precision Medicine
- Note: Projects Alpha and Beta involve the Drug Discovery team and are related
  to Oncora drug development

### Publications (Scholarly Article)

- Properties: name, description, about, identifier, author, date published
- Author links to People
- 83 instances
- **Drug Discovery**: "Cheminformatics Lead Optimization", "Structure Activity
  Relationship", "Protein Structure Prediction Design", "Vector Embeddings Drug
  Discovery"
- **Clinical Studies**: "Cardiozen Phase III Outcomes", "Immunex Phase II
  Safety", "Neurova Phase I Tolerability", "Oncora Phase III Efficacy", "Vitalis
  Long Term Safety"
- **Manufacturing**: "Predictive Maintenance ML", "Process Capability Index
  Forecasting", "Quality Analytics Automation"
- **Data/AI**: "Data Lineage Governance", "Federated Learning Orchestration",
  "Hybrid Search Architecture", "Temporal Data Processing"

### Blog Posts (Blog Posting)

- Properties: name, headline, article body, about, author, date published, is
  part of, mentions
- Author links to People
- Is part of links to Digital Documents (bidirectional with has part)
- 67 instances
- **Platform Updates**: "MolecularForge Embedding Updates", "ClinicalStream Real
  Time Ingestion", "ManufacturingOS Digital Thread"
- **Technical Deep Dives**: "Microservices Architecture Evolution", "Hybrid
  Search Strategies", "Vector Cache Optimization", "Memory Efficiency Upgrades"
- **Process Improvements**: "GMP Compliance Digital", "Trial Automation
  Platform", "Regulatory Submission Automation"
- **AI/ML Topics**: "AI Ethics Guidelines", "Model Drift Monitoring", "Federated
  Learning Clinical Sites"

### Comments (Comment)

- Properties: about, author, text, date created
- Author links to People
- 55 instances

### Software Applications (Software Application)

- Properties: name, description, application category, software version,
  software requirements, is related to
- Software requirements links to Software Applications
- 28 instances
- **Drug Discovery**: MolecularForge (AI drug discovery platform),
  DrugDesignStudio
- **Clinical Operations**: ClinicalStream (trial management), TrialFlow,
  PatientCentric
- **Laboratory**: BioAnalyzer (lab data analysis)
- **Manufacturing**: ManufacturingOS (requires ProcessControl + BioAnalyzer),
  ProcessControl (manufacturing control), GMP360
- **Data/Analytics**: AnalyticsHub, DataLake, HybridSearch, TemporalAnalytics
- **ML/AI**: MLFlow, ModelRetraining, SyntheticDataToolkit
- **Compliance**: ComplianceMonitor, Pharmacovigilance
- **Infrastructure**: APIGateway, CloudOps, SecurityVault, DeploymentSecurity

### Reviews (Review)

- Properties: name, author, item reviewed, review body, review rating, mentions
- Author links to People
- Item reviewed links to Software Applications or Drugs or Courses
- Review rating links to Ratings
- 35 instances
- **Platform Reviews**: GMP360 Compliance, TrialFlow Usability, HybridSearch
  Engine, ComplianceMonitor Real Time Rules, AnomalyDetection Platform, Vector
  Cache Optimization, Memory Efficiency Upgrades
- **Drug Reviews**: Oncora Efficacy Phase3, Cardiozen Hemodynamic Benefits,
  Immunex Cytokine Modulation, Immunex-Plus Combination Synergy, Neurova
  Cognitive Endpoints, Oncora-XR Formulation Performance, Oncovex Safety,
  Vitalis Registry Effectiveness, Novamed Efficacy
- **Course Reviews**: AI Ethics Course Accountability, Clinical Data Integrity
  Course, Precision Medicine Course, Regulatory Affairs Workshop
- **Process Reviews**: Data Lineage Framework, Pharmacovigilance Submission
  Automation, Pipeline Reliability Engineering, Secure Deployment Practices,
  Synthetic Data Validation, Temporal Analysis Techniques

### FAQ Pages (FAQ Page)

- Properties: name, main entity
- Main entity links to Questions
- 35 instances
- **Clinical**: Clinical Trial Phases, Adverse Event Reporting, Drug Approval
  Process, Patient Reported Outcomes Value, Quality of Life Outcomes
- **Technical**: Hybrid Search Benefits, Vector Search Accuracy, Vector Caching
  Strategy, Model Drift Detection, Temporal Data Processing, Synthetic Data
  Validation
- **Compliance**: GMP Compliance, Data Integrity, Pharmacovigilance Workflow,
  Secure Deployment Practices
- **Platform**: Automation Platform Benefits, Compliance Monitoring
  Architecture, Digital Thread Value, Layered Deployment Security, Pipeline
  Reliability Engineering
- **Scientific**: Dose Optimization Rationale, PK-PD Modeling, Cognitive
  Biomarker Validation, Long Term Safety Followup
- **Process**: Data Lineage Benefits, Multi Modal Fusion Purpose, Ontology
  Updates, Microservices Boundaries, Federated Learning Benefits, Bias Auditing
  Methods
- **Business**: Adaptive Supply Chain Analytics, Trial Enrollment Forecasting,
  Global Collaboration Benefits, Precision Medicine Benefits, Rare Disease
  Registry Value

### Questions (Question)

- Properties: name, accepted answer
- Accepted answer links to Answers
- 19 instances

### Answers (Answer)

- Properties: text, mentions, about
- 18 instances

### Clinical Trials (Medical Trial)

- Properties: name, description, identifier, citation, location, study subject,
  investigator
- Citation links to Digital Documents
- 22 instances
- **Cardiozen Trials**: Cardiozen Phase III, Cardiozen Dose Ranging, Cardiozen
  Quality of Life, Cardiozen Cardiologist Feedback
- **Immunex Trials**: Immunex Phase II, Immunex Autoimmune Biomarkers, Immunex
  Pharmacodynamic Correlation, Immunex Biomarker Extension
- **Immunex-Plus Trials**: Immunex-Plus Preclinical Safety, Immunex-Plus Dosing
  Strategy
- **Neurova Trials**: Neurova Phase I, Neurova Cognitive Biomarker, Neurova Drug
  Drug Interaction, Neurova Neurodegeneration Biomarkers
- **Oncora Trials**: Oncora Phase III, Oncora Dose Optimization, Oncora-XR
  Preclinical Release, Oncora-XR Steady State
- **Vitalis Trials**: Vitalis Long Term Safety, Vitalis Postmarketing Study,
  Vitalis Rare Disease Registry

### Roles (Role)

- Properties: role name, main entity, main entity of page, start date, end date
- Main entity links to Questions
- Main entity of page links to Organizations
- 25 instances
- **Executive**: CEO
- **Scientific Leadership**: Clinical Lead, Genomics Lead, R&D Director
- **Data/AI Roles**: Clinical Data Scientist, Data Engineering Lead, Synthetic
  Data Scientist, Vector Retrieval Specialist, Memory Optimization Engineer,
  Multi Modal Integration Specialist
- **Engineering**: Deployment Reliability Engineer, Observability Engineer,
  Security Architect
- **Research**: Federated Learning Researcher, PK-PD Modeler
- **Quality/Compliance**: Manufacturing Compliance Specialist, Quality Manager,
  Quality Manager Successor, Pharmacovigilance Officer
- **Business**: Patient Engagement Strategist, Registry Outcomes Analyst, Supply
  Chain Analyst, Trial Automation Strategist
- **Governance**: AI Ethics Officer, Lineage Governance Analyst

### Creative Works (Creative Work)

- Properties: name, description, about, identifier, is part of, contributor,
  creator, date created, date modified
- Is part of links to Digital Documents (bidirectional with has part)
- Contributor and creator link to People
- 12 instances

### How-To Guides (How-To)

- Properties: name, description, identifier, step, is related to
- 20 instances
- **Clinical Data Management**: Clinical Data Entry, Data Query Resolution, Data
  Lock Freeze, Data Export Analysis, Clinical Study Report Generation, Patient
  Consent Collection, Patient Data Protection
- **GMP Procedures**: GMP Audit Readiness, GMP Batch Release, GMP CAPA
  Implementation, GMP Cleaning Validation, GMP Contamination Control, GMP
  Deviation Triage, GMP Environmental Monitoring, GMP Product Recall, GMP
  Quality Risk Management, GMP Supplier Qualification
- **Safety/Regulatory**: Adverse Event Reporting, Data Anonymization Workflow,
  Regulatory Submission Prep

### Digital Documents (Digital Document)

- Properties: name, description, identifier, is part of, citation, has part, is
  related to
- Is part of links to Digital Documents (bidirectional with has part)
- Citation links to Digital Documents (bidirectional with has part)
- Has part links to Digital Documents (bidirectional with citation)
- 17 instances

### Drugs (Drug)

- Properties: name, description, identifier, is part of, drug class, active
  ingredient, clinical pharmacology, legal status, is related to
- Is part of links to Drugs (for pipeline dependencies)
- 10 instances
- **Oncology**: Oncora (targeted kinase inhibitor, Phase III near submission),
  Oncora-XR (extended-release formulation), Oncovex
- **Cardiovascular**: Cardiozen (ion channel modulator)
- **Immunology**: Immunex (immune modulator), Immunex-Plus (combination therapy
  requiring Immunex + Cardiozen)
- **Neuroscience**: Neurova (neurotransmitter modulator), Neurogenex
- **Other**: Vitalis (metabolic disorder treatment), Novamed

### Training Courses (Course)

- Properties: name, description, identifier, provider, educational credential
  awarded, course prerequisites, is related to
- Provider links to Organizations
- Course prerequisites links to Courses
- 16 instances
- **Pharmaceutical Sciences Track**: Pharm-101, Pharm-201, Pharm-301, Pharm-Cert
  (certification)
- **Manufacturing Excellence Track**: Mfg-101, Mfg-201, Mfg-301, Mfg-Cert
  (certification)
- **Data Science Track**: Data-101, Data-201, Data-301, Data-Cert
  (certification)
- **Specialized Courses**: Regulatory Affairs (advanced with prerequisites), AI
  Ethics, Precision Medicine, Clinical Data Integrity

### Medical Organizations (Medical Organization)

- Properties: name, description, identifier, employee, address, is related to
- Employee links to People
- Address links to Postal Addresses
- 15 instances
- **Clinical Sites**: Northern Cardiology Institute, Eastern Oncology Center,
  Western Immunology Clinic, Central Neuroscience Institute
- **Specialty Centers**: Autoimmune Biomarker Hub, Cardiac Outcomes Consortium,
  Cognitive Endpoint Validation Center, Combination Therapy Research Site
- **Analytical Centers**: DDI Assessment Facility, Extended Pharmacodynamics
  Unit, Longitudinal Safety Analytics Center, Neuroimaging Precision Center,
  Oncology Translational Lab
- **Registries**: Global Metabolic Registry Network, Rare Disease Reference
  Center

### Postal Addresses (Postal Address)

- Properties: street address, address locality, address region, postal code,
  address country
- 3 instances

### Policies (Policy)

- Properties: name
- 9 instances
- **Core Policies**: AI Ethics, Data Governance, GMP, ICH-GCP, Identity Access,
  Pharmacovigilance, RWE Guidance, Security, Security Compliance
- **Policy Hierarchy**: Master QMS (referenced in
  `policy/framework/gmp-compliance` DigitalDocument), with Clinical Trial Policy
  citing the Master QMS
- **Compliance Frameworks**: FDA, GMP, HIPAA, ICH-GCP (documented as
  DigitalDocuments under `policy/framework/`)

### Events (Event)

- Properties: name, description, about, attendee, organizer, start date, end
  date
- 8 instances
- **Drug Development**: Cardiozen Manufacturing Scale Review, Immunex Biomarker
  Model Demo, Neurova Safety Escalation Review, Oncora-XR Regulatory Summit
- **Project Management**: Project Alpha Kickoff
- **Data/Compliance**: Clinical Data Harmonization Milestone, Integrated
  Compliance Intelligence Audit
- **Commercial**: Sales Enablement Launch

### Services (Service)

- Properties: name, description, provider, service type, area served, is related
  to
- Provider links to Organizations
- 3 instances
- Clinical Trial Conduct, Contract Manufacturing, Regulatory Consulting

### Ratings (Rating)

- Properties: rating value, best rating, worst rating
- 35 instances

### Platforms (Platform)

- Properties: name
- 1 instance (InsightAI)

### Blogs (Blog)

- Properties: blog post
- 1 instance

### Places (Place)

- Properties: location-related properties
- 5 instances

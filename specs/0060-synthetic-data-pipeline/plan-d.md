# Plan 03 — Distilabel Pipeline

> Synthetic data pipeline built on Argilla's Distilabel framework, using its
> DAG-based step orchestration, built-in LLM integrations, and dataset
> management to generate all four content types.

## Approach

Use [Distilabel](https://distilabel.argilla.io/) as the pipeline framework.
Distilabel provides a DAG of steps (GeneratorStep → Task → processing) that
orchestrate LLM calls, post-processing, and validation. Each content type
becomes a Distilabel pipeline with typed inputs/outputs, automatic batching, and
built-in support for multiple LLM backends. Generated datasets flow into Argilla
for human review before committing to the monorepo.

## Architecture

```
seed.yaml
    │
    ▼
┌──────────────────────────────────────────────────┐
│              Distilabel Pipelines                 │
│                                                   │
│  Pipeline 1: Organization ──────────────────────┐ │
│    LoadSeed → GeneratePeople → GenerateOrgs     │ │
│    → GenerateProjects → AssembleOntology        │ │
│                                                  │ │
│  Pipeline 2: Framework ─────────────────────────┤ │
│    LoadSchemas → GenerateCapabilities           │ │
│    → GenerateDisciplines → GenerateTracks       │ │
│    → GenerateBehaviours → ValidateYAML          │ │
│                                                  │ │
│  Pipeline 3: Scenarios ─────────────────────────┤ │
│    LoadSeed → GenerateSignalCurves              │ │
│    → BindEntities → ValidateCoherence           │ │
│                                                  │ │
│  Pipeline 4: Content ───────────────────────────┤ │
│    LoadOntology → GenerateArticles              │ │
│    → GenerateBlogs → GenerateFAQs               │ │
│    → AssembleHTML → ValidateMicrodata            │ │
│                                                  │ │
│  Pipeline 5: Activity ──────────────────────────┤ │
│    LoadPeople → GenerateGitHub                  │ │
│    → GenerateSurveys → GenerateEvidence         │ │
│    → ValidateCorrelations                        │ │
│                                                  │ │
│  Pipeline 6: Personal ──────────────────────────┘ │
│    SelectPersonas → GenerateBriefings             │
│    → GenerateNotes → AssembleKB                   │
│                                                   │
└───────────────┬───────────────────────────────────┘
                │
                ▼
         Argilla Server (optional review)
                │
                ▼
         Export to Monorepo Locations
```

## Why Distilabel

1. **DAG orchestration**: Steps declare inputs/outputs; Distilabel handles
   execution order, batching, and parallelism automatically
2. **Multi-LLM support**: Built-in integrations for OpenAI, Anthropic, vLLM,
   llama.cpp, Ollama — switch providers without code changes
3. **Structured output**: Native support for JSON/Pydantic output schemas via
   `structured_output` parameter on LLM tasks
4. **Dataset management**: Output is a Distiset (HuggingFace Dataset wrapper)
   with versioning, deduplication, and export
5. **Argilla integration**: Generated data can flow into Argilla for human
   review before export — useful for validating quality of first runs

## Seed Data

Same `seed.yaml` structure as Plans 01 and 02. Loaded as the initial dataset for
Pipeline 1.

## Pipeline Definitions

### Pipeline 1 — Organization

```python
from distilabel.pipeline import Pipeline
from distilabel.steps import LoadDataFromDicts, StepInput, step
from distilabel.steps.tasks import TextGeneration
from distilabel.llms import AnthropicLLM

@step(inputs=["seed"], outputs=["people"])
def GeneratePeopleStep(inputs: StepInput):
    """Split seed into batched people generation requests."""
    for input in inputs:
        seed = input["seed"]
        for dept in seed["organization"]["departments"]:
            for team in dept["teams"]:
                yield {
                    "people": {
                        "department": dept["id"],
                        "team": team["id"],
                        "count": team["members"],
                        "manager": team["manager"],
                        "level_distribution": seed["people"]["distribution"],
                    }
                }

class GeneratePeopleTask(TextGeneration):
    """Generate person entities for a team."""

    @property
    def prompt(self):
        return """Generate {count} people for the {team} team in {department}.
        Use Greek mythology names. Each person needs:
        - iri: /id/person/<lowercase_name>
        - name: Full name
        - jobTitle: Appropriate for their level and discipline
        - level: From distribution {level_distribution}
        - discipline: From [software_engineering, data_engineering, engineering_management]
        - email: <name>@bionova.example

        Output as JSON array."""

with Pipeline(name="organization") as org_pipeline:
    load_seed = LoadDataFromDicts(data=[{"seed": seed_data}])

    generate_people = GeneratePeopleTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
        structured_output={
            "type": "json",
            "schema": PERSON_SCHEMA
        }
    )

    assemble_ontology = AssembleOntologyStep()
    validate_entities = ValidateEntitiesStep()

    load_seed >> generate_people >> assemble_ontology >> validate_entities
```

### Pipeline 2 — Framework Content

```python
@step(inputs=["schema_path"], outputs=["yaml_content"])
def GenerateFromSchemaStep(inputs: StepInput):
    """Generate YAML content conforming to a JSON schema."""
    for input in inputs:
        schema = load_json(input["schema_path"])
        yield {"schema": schema, "schema_path": input["schema_path"]}

class GenerateYAMLTask(TextGeneration):
    """Generate YAML content matching a JSON schema."""

    system_prompt = """You are generating YAML content for an engineering
    career framework. Follow these vocabulary standards:
    - awareness: "You understand...", "You can use... with guidance"
    - foundational: "You apply...", "You create simple..."
    - working: "You design... independently"
    - practitioner: "You lead... across teams in your area"
    - expert: "You define... across the business unit"

    Output valid YAML only. No explanations."""

@step(inputs=["yaml_content", "schema_path"], outputs=["validated"])
def ValidateYAMLStep(inputs: StepInput):
    """Validate generated YAML against JSON schema and fit-map."""
    for input in inputs:
        # Write to temp file and run fit-map validate
        result = subprocess.run(
            ["npx", "fit-map", "validate", "--file", temp_path],
            capture_output=True
        )
        if result.returncode != 0:
            # Re-queue with error context for retry
            yield {
                "validated": False,
                "errors": result.stderr.decode(),
                "yaml_content": input["yaml_content"],
                "retry_count": input.get("retry_count", 0) + 1
            }
        else:
            yield {"validated": True, "yaml_content": input["yaml_content"]}

with Pipeline(name="framework") as framework_pipeline:
    load_schemas = LoadDataFromDicts(data=[
        {"schema_path": f"products/map/schema/json/{f}"}
        for f in SCHEMA_FILES
    ])

    generate = GenerateYAMLTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )

    validate = ValidateYAMLStep()
    retry_filter = FilterRetryStep(max_retries=3)

    load_schemas >> generate >> validate >> retry_filter
    retry_filter.retry >> generate  # Re-prompt failed generations
```

### Pipeline 3 — Scenario Signal Curves

```python
@step(inputs=["scenario"], outputs=["signal_curves"])
def GenerateSignalCurvesStep(inputs: StepInput):
    """Deterministically generate signal curves from scenario definitions."""
    for input in inputs:
        scenario = input["scenario"]
        curves = {}
        for team_id, signals in scenario["signals"].items():
            for signal_domain, params in signals.items():
                curve = compute_signal_curve(
                    signal_type=params,
                    start=scenario["timerange"]["start"],
                    end=scenario["timerange"]["end"]
                )
                curves[f"{team_id}.{signal_domain}"] = curve
        yield {"signal_curves": curves, "scenario_id": scenario["id"]}

with Pipeline(name="scenarios") as scenario_pipeline:
    load_scenarios = LoadDataFromDicts(data=[
        {"scenario": s} for s in seed_data["scenarios"]
    ])
    generate_curves = GenerateSignalCurvesStep()
    bind_entities = BindEntitiesToScenariosStep()

    load_scenarios >> generate_curves >> bind_entities
```

### Pipeline 4 — Organizational Content (HTML)

```python
class GenerateHTMLArticleTask(TextGeneration):
    """Generate HTML5 microdata articles for Guide."""

    system_prompt = """Generate HTML5 content with schema.org microdata.
    Use itemscope, itemtype, itemprop, and itemid attributes.
    All entity IRIs must use the provided identifiers exactly.
    Format: {format_spec}"""

@step(inputs=["html_content"], outputs=["validated_html"])
def ValidateMicrodataStep(inputs: StepInput):
    """Parse HTML and validate microdata cross-references."""
    for input in inputs:
        html = input["html_content"]
        entities = extract_microdata_entities(html)
        errors = []
        for entity in entities:
            if entity["itemid"] not in KNOWN_IRIS:
                errors.append(f"Unknown IRI: {entity['itemid']}")
        yield {
            "validated_html": html,
            "valid": len(errors) == 0,
            "errors": errors
        }

with Pipeline(name="content") as content_pipeline:
    load_ontology = LoadOntologyStep()

    # Parallel generation of different content types
    articles = GenerateHTMLArticleTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )
    blogs = GenerateHTMLBlogTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )
    faqs = GenerateHTMLFAQTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )

    validate = ValidateMicrodataStep()
    assemble = AssembleHTMLFilesStep()

    load_ontology >> [articles, blogs, faqs] >> validate >> assemble
```

### Pipeline 5 — Activity Content

```python
@step(inputs=["person", "signal_curves"], outputs=["github_events"])
def GenerateGitHubEventsStep(inputs: StepInput):
    """Generate GitHub events modulated by scenario signals."""
    for input in inputs:
        person = input["person"]
        curves = input["signal_curves"]
        events = generate_poisson_events(person, curves)
        yield {"github_events": events}

class GenerateEvidenceTask(TextGeneration):
    """Generate skill marker evidence statements."""

    system_prompt = """Write a brief evidence statement (2-3 sentences)
    demonstrating the specified skill at the specified proficiency level.
    The evidence should reference the person's actual projects and team context."""

with Pipeline(name="activity") as activity_pipeline:
    load_people = LoadPeopleStep()
    load_curves = LoadSignalCurvesStep()

    github = GenerateGitHubEventsStep()
    surveys = GenerateSurveyScoresStep()  # Deterministic
    evidence = GenerateEvidenceTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )

    roster = GenerateRosterStep()  # Deterministic

    [load_people, load_curves] >> github
    [load_people, load_curves] >> surveys
    [load_people, load_curves] >> evidence
    load_people >> roster
```

### Pipeline 6 — Personal Content

```python
class GenerateBriefingTask(TextGeneration):
    """Generate weekly briefing notes for a persona."""

    system_prompt = """Write a weekly briefing note in Markdown for {person_name},
    a {level} {discipline} on the {team} team. Reference their current projects
    and recent activity. Include sections: Summary, Key Updates, Action Items."""

with Pipeline(name="personal") as personal_pipeline:
    select = SelectPersonasStep(count=5, levels=["L1", "L3", "L5"])
    briefings = GenerateBriefingTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )
    notes = GenerateKnowledgeNotesTask(
        llm=AnthropicLLM(model="claude-sonnet-4-20250514"),
    )
    assemble = AssembleKnowledgeBaseStep()

    select >> [briefings, notes] >> assemble
```

## Master Pipeline

```python
from distilabel.pipeline import Pipeline

with Pipeline(name="synthetic-data-master") as master:
    org = org_pipeline
    scenarios = scenario_pipeline
    framework = framework_pipeline
    content = content_pipeline
    activity = activity_pipeline
    personal = personal_pipeline

    # Execution order enforced by data dependencies
    org >> scenarios >> content
    org >> framework
    org >> activity
    [scenarios, org] >> activity
    [org, activity] >> personal

    # Final cross-validation
    [content, framework, activity, personal] >> CrossValidateStep()

# Run
distiset = master.run()

# Optional: push to Argilla for review
distiset.push_to_argilla(name="bionova-synthetic-data")

# Export to monorepo locations
export_to_monorepo(distiset)
```

## Argilla Review (Optional)

For first-time generation or quality assurance, route output through Argilla:

```python
import argilla as rg

# Create Argilla dataset for review
dataset = rg.Dataset(
    name="bionova-synthetic-review",
    settings=rg.Settings(
        fields=[
            rg.TextField(name="content_type"),
            rg.TextField(name="generated_content"),
            rg.TextField(name="source_entities"),
        ],
        questions=[
            rg.RatingQuestion(name="quality", values=[1, 2, 3, 4, 5]),
            rg.TextQuestion(name="corrections"),
            rg.LabelQuestion(name="approval", labels=["approved", "needs_revision"]),
        ],
    ),
)

# Push generated content for review
for record in distiset_to_records(distiset):
    dataset.records.log([record])
```

## Cross-Content Validation

Implemented as a final Distilabel step:

```python
@step(
    inputs=["org_entities", "framework_yaml", "activity_data", "personal_content"],
    outputs=["validation_report"]
)
def CrossValidateStep(inputs: StepInput):
    """Validate coherence across all content types."""
    for input in inputs:
        report = {
            "org_people_in_activity": check_people_coverage(
                input["org_entities"], input["activity_data"]
            ),
            "roles_valid_for_framework": check_framework_validity(
                input["org_entities"], input["framework_yaml"]
            ),
            "github_correlates_scenarios": check_signal_correlation(
                input["activity_data"]["github"], signal_curves, threshold=0.7
            ),
            "dx_correlates_scenarios": check_signal_correlation(
                input["activity_data"]["dx_surveys"], signal_curves, threshold=0.6
            ),
            "evidence_meets_floor": check_evidence_proficiency(
                input["activity_data"]["evidence"], scenarios
            ),
            "html_iris_valid": check_iri_coverage(
                input["org_entities"]
            ),
            "basecamp_refs_valid": check_basecamp_references(
                input["personal_content"], input["org_entities"]
            ),
        }
        all_passed = all(r["passed"] for r in report.values())
        yield {"validation_report": report, "all_passed": all_passed}
```

## Output File Mapping

| Generated Content       | Target Location                         |
| ----------------------- | --------------------------------------- |
| ONTOLOGY.md             | `products/guide/examples/knowledge/`    |
| README.md               | `products/guide/examples/knowledge/`    |
| HTML microdata files    | `products/guide/examples/knowledge/`    |
| Framework YAML          | `products/map/examples/`                |
| Organization people     | `products/map/examples/activity/`       |
| GitHub events/artifacts | `products/map/examples/activity/`       |
| GetDX snapshots/scores  | `products/map/examples/activity/`       |
| Evidence records        | `products/map/examples/activity/`       |
| Personal knowledge base | `products/basecamp/template/knowledge/` |

## CLI Interface

```sh
# Full pipeline
python -m synth_pipeline run

# Individual pipelines
python -m synth_pipeline run --pipeline organization
python -m synth_pipeline run --pipeline framework
python -m synth_pipeline run --pipeline content
python -m synth_pipeline run --pipeline activity
python -m synth_pipeline run --pipeline personal

# With Argilla review
python -m synth_pipeline run --review

# Export reviewed data to monorepo
python -m synth_pipeline export

# Use different LLM backend
python -m synth_pipeline run --llm ollama --model qwen3:32b
python -m synth_pipeline run --llm anthropic --model claude-sonnet-4-20250514
```

## LLM Backend Configuration

Distilabel supports swapping LLM backends without code changes:

```python
# Claude API
llm = AnthropicLLM(model="claude-sonnet-4-20250514")

# Local Ollama
from distilabel.llms import OllamaLLM
llm = OllamaLLM(model="qwen3:32b")

# vLLM (for GPU servers)
from distilabel.llms import vLLM
llm = vLLM(model="Qwen/Qwen3-32B")

# OpenAI-compatible (llama.cpp, etc.)
from distilabel.llms import OpenAILLM
llm = OpenAILLM(base_url="http://localhost:8080/v1", model="local")
```

## Dependencies

```
# Python
distilabel>=1.5
argilla>=2.0  # Optional, for review UI
anthropic>=0.40
pyyaml>=6.0

# Node.js (existing)
# Used for fit-map validate calls
```

## Implementation Phases

### Phase A — Distilabel Setup (1 day)

- Install Distilabel and configure LLM backend
- Create project structure under `scripts/generate/`
- Define seed.yaml
- Set up Argilla server (Docker) for optional review

### Phase B — Organization & Framework Pipelines (2 days)

- Implement Pipeline 1 (Organization) with entity generation
- Implement Pipeline 2 (Framework) with schema validation
- Implement Pipeline 3 (Scenarios) with deterministic curves
- Verify YAML output passes `npx fit-map validate`

### Phase C — Content Pipeline (3 days)

- Implement Pipeline 4 (HTML microdata generation)
- HTML microdata parser for validation
- Implement retry logic for failed validations
- Generate all Guide HTML files

### Phase D — Activity & Personal Pipelines (2 days)

- Implement Pipeline 5 (Activity) with deterministic + LLM steps
- Implement Pipeline 6 (Personal) with Basecamp Markdown
- Statistical validation of correlations

### Phase E — Integration (1 day)

- Master pipeline wiring
- Cross-validation step
- Export script to monorepo locations
- Remove old hand-crafted content
- Optional Argilla review workflow documentation

## Strengths

- **Production-grade orchestration**: Distilabel handles batching, retries, rate
  limiting, and error recovery out of the box
- **LLM-agnostic**: Switch between Claude, Ollama, vLLM without code changes
- **Dataset management**: Distiset provides versioned, typed datasets with
  export to multiple formats
- **Human-in-the-loop**: Argilla integration enables quality review before
  committing generated data
- **Parallel execution**: DAG-based steps execute in parallel where data
  dependencies allow
- **Reproducibility**: Pipeline runs are logged with full provenance

## Weaknesses

- **Python dependency**: Adds Python toolchain to a Node.js monorepo
- **Framework learning curve**: Distilabel's step/task abstraction requires
  understanding its DAG model
- **Overhead for simple tasks**: Deterministic generation (signal curves,
  rosters) doesn't benefit from Distilabel's LLM orchestration
- **Argilla server**: Optional review requires running a separate service
- **Version coupling**: Distilabel API evolves rapidly; pipeline code may need
  updates with new releases

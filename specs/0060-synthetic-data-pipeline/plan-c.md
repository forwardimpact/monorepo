# Plan 02 — Local Open-Weight Models Pipeline

> Fully offline generation pipeline running open-weight models on an Apple Mac
> Studio M4 Max (128 GB unified memory) via MLX and llama.cpp, with no external
> API dependencies.

## Approach

Run the entire generation pipeline locally using open-weight models optimized
for Apple Silicon. Use MLX for models that fit comfortably in unified memory and
llama.cpp as a fallback for larger quantized models. A Python orchestrator
coordinates generation across specialized model roles: a large model for
creative content and a smaller model for structured data generation.

## Architecture

```
seed.yaml ──► Python Orchestrator
                 │
                 ├── MLX Server (port 8080)
                 │    └── Qwen3-32B (creative content, HTML, Markdown)
                 │
                 ├── llama.cpp Server (port 8081)
                 │    └── Qwen3-8B (structured YAML/JSON, tabular data)
                 │
                 └── Deterministic Generators (no LLM)
                      └── Activity data (GitHub events, survey scores)
                 │
                 ▼
            Validator (Node.js — Ajv + fit-map validate)
                 │
            ◄── retry on failure ──►
```

## Model Selection

### Primary Model: Qwen3-32B (MLX, 4-bit quantized)

- **Memory:** ~18 GB VRAM (fits easily in 128 GB unified memory)
- **Role:** Creative content generation — HTML microdata, Markdown narratives,
  ONTOLOGY descriptions, README content, Basecamp personal notes
- **Strength:** Strong instruction following, good at structured output
- **Format:** MLX 4-bit quantization via `mlx-community/Qwen3-32B-4bit`

### Secondary Model: Qwen3-8B (llama.cpp, Q6_K quantized)

- **Memory:** ~6.5 GB VRAM
- **Role:** Structured data generation — YAML framework files, JSON activity
  records, tabular data
- **Strength:** Fast inference, good at following schemas, lower latency for
  many small generations
- **Format:** GGUF Q6_K quantization

### Why Two Models

The 32B model produces higher-quality prose and better cross-entity coherence
for content like HTML articles and Markdown briefings. The 8B model is faster
for high-volume structured generation (hundreds of YAML entries, thousands of
activity records) where quality requirements are lower but schema compliance is
critical.

## Seed Data

Identical `seed.yaml` structure to Plan 01 (see Plan 01 for full schema). The
seed file is the single source of truth shared across all plans.

## Generation Pipeline

### Stage 1 — Model Setup

```sh
# Install MLX
pip install mlx-lm

# Download models
mlx_lm.download --model mlx-community/Qwen3-32B-4bit

# Start MLX server for creative content
mlx_lm.server --model mlx-community/Qwen3-32B-4bit --port 8080 &

# Start llama.cpp server for structured data
llama-server -m models/qwen3-8b-q6_k.gguf --port 8081 \
  --ctx-size 8192 --n-gpu-layers 99 &
```

### Stage 2 — Organization Skeleton

**Model:** Qwen3-32B (MLX) **Output:** ONTOLOGY.md, README.md, entity manifest
(JSON)

**Strategy:**

1. Send seed organization structure as system prompt
2. Generate people names (greek mythology theme) in batches of 20
3. Generate department/team descriptions with cross-references
4. Generate project descriptions linked to teams and people
5. Assemble ONTOLOGY.md from generated entities

**Prompt template:**

```
<system>
You are generating entities for a fictional pharmaceutical company called
BioNova. All person names use Greek mythology. Output valid JSON arrays.
</system>

<user>
Generate 20 people for the {department} department.
Each person needs: iri, name, jobTitle, team, level (from L1-L5),
discipline (from: software_engineering, data_engineering, engineering_management).

Distribution: {level_distribution}
Team: {team_name} ({team_size} members)
Manager: {manager_iri}

Existing people (avoid duplicate names): {existing_names}
</user>
```

**Validation:**

- Parse JSON output, verify uniqueness of all IRIs and names
- Verify level distribution matches seed percentages (±5%)
- Verify all team member counts match seed targets

### Stage 3 — Framework Content (Map YAML)

**Model:** Qwen3-8B (llama.cpp) **Output:** All YAML files under
`products/map/examples/`

**Strategy:**

1. For each schema file in `products/map/schema/json/`, generate matching YAML
2. Use constrained decoding (llama.cpp grammar mode) to enforce YAML structure
3. Generate capabilities with skills, proficiency descriptions, agent sections
4. Use AGENTS.md vocabulary standards as prompt context for level-appropriate
   language

**Grammar-constrained generation:**

```
# llama.cpp GBNF grammar for capability YAML
root ::= "id: " identifier "\n" "name: " quoted-string "\n" ...
identifier ::= [a-z] [a-z0-9_]*
quoted-string ::= "\"" [^"]+ "\""
```

**Validation loop:**

```python
for schema_type in ['capabilities', 'disciplines', 'tracks', 'behaviours']:
    for attempt in range(3):
        yaml_content = generate(schema_type, seed_data)
        result = subprocess.run(['npx', 'fit-map', 'validate'], capture_output=True)
        if result.returncode == 0:
            break
        # Extract errors and re-prompt with error context
        errors = parse_validation_errors(result.stderr)
        seed_data['previous_errors'] = errors
```

### Stage 4 — Story Scenarios (Signal Curves)

**Model:** Deterministic (no LLM needed) **Output:** Scenario manifest with
month-by-month signal values

**Strategy:**

Signal curves are generated deterministically from seed scenario definitions:

```python
def generate_signal_curve(scenario, signal_type):
    """Generate normalized 0.0-1.0 signal values per month."""
    start = scenario['timerange']['start']
    end = scenario['timerange']['end']
    months = month_range(start, end)

    if signal_type == 'spike':
        # Sharp rise, peak at 60%, gradual decline
        return [bell_curve(i, len(months), peak_pos=0.6) for i in range(len(months))]
    elif signal_type == 'sustained_high':
        # Ramp up to plateau
        return [sigmoid(i, len(months), midpoint=0.3) for i in range(len(months))]
    elif signal_type == 'rising':
        # Linear increase
        return [i / len(months) for i in range(len(months))]
    elif signal_type == 'declining':
        # Linear decrease
        return [1 - i / len(months) for i in range(len(months))]
```

### Stage 5 — Organizational Content (HTML Microdata)

**Model:** Qwen3-32B (MLX) **Output:** HTML files under
`products/guide/examples/knowledge/`

**Strategy:**

1. Feed GENERATE.prompt.md as format specification
2. Generate one HTML file at a time, providing entity IRIs from Stage 2
3. Use the existing HTML files as few-shot examples for microdata format
4. Post-process with an HTML parser to fix any malformed tags

**Chunked generation for large files:**

```python
# Generate articles in batches to stay within context window
for topic_batch in chunk(article_topics, batch_size=5):
    html_fragment = generate_html(
        model='qwen3-32b',
        entities=relevant_entities(topic_batch),
        format_spec=GENERATE_PROMPT_MD,
        existing_html=previous_fragments
    )
    validate_microdata(html_fragment)
    fragments.append(html_fragment)

# Assemble final HTML file
assemble_html_file(fragments, output_path)
```

### Stage 6 — Activity Content (Landmark Tables)

**Model:** Deterministic + Qwen3-8B for evidence text **Output:** JSON/CSV under
`products/map/examples/activity/`

**Strategy:**

Most activity data is generated deterministically from the scenario signal
curves, with LLM assistance only for free-text evidence descriptions:

1. **organization_people** — Direct mapping from Stage 2 entities (no LLM)
2. **github_events** — Poisson-distributed daily events modulated by scenario
   signal curves (no LLM)
3. **github_artifacts** — Deterministic repo/file structure per team (no LLM)
4. **getdx_snapshots** — Monthly snapshots with scores derived from signal
   curves plus Gaussian noise (no LLM)
5. **Evidence text** — Qwen3-8B generates short evidence statements against
   skill markers (LLM needed for natural language)

```python
def generate_github_events(person, scenario_signals, months):
    """Generate daily GitHub events modulated by scenario signals."""
    events = []
    for month in months:
        # Base rate depends on discipline and level
        base_rate = BASE_COMMIT_RATES[person['discipline']][person['level']]
        # Modulate by scenario signal
        signal = scenario_signals.get(month, 0.5)
        daily_rate = base_rate * (0.5 + signal)
        # Poisson-distributed daily events
        for day in days_in_month(month):
            n_events = poisson(daily_rate)
            for _ in range(n_events):
                events.append({
                    'timestamp': random_time(day),
                    'author_email': person['email'],
                    'repo': random.choice(person['team_repos']),
                    'event_type': weighted_choice(EVENT_TYPES),
                    'additions': max(1, int(gauss(50, 30))),
                    'deletions': max(0, int(gauss(20, 15)))
                })
    return events
```

### Stage 7 — Personal Content (Basecamp Markdown)

**Model:** Qwen3-32B (MLX) **Output:** Markdown files under
`products/basecamp/template/knowledge/`

**Strategy:**

1. Select 3-5 representative people at levels L1, L3, L5
2. For each person, generate:
   - Weekly briefing notes referencing their team's projects
   - Personal knowledge graph entries
   - Meeting prep notes
3. Use their activity data from Stage 6 as context

## Cross-Content Validation

Same validation matrix as Plan 01, executed via Node.js scripts that the Python
orchestrator invokes:

```sh
# Run all validations
node scripts/generate/cross-validate.js

# Checks performed:
# ✓ org_html_people ⊆ activity_people
# ✓ people_roles ⊂ valid_framework_combinations
# ✓ github_patterns ~ scenario_signals (r > 0.7)
# ✓ dx_scores ~ scenario_expectations (r > 0.6)
# ✓ evidence_proficiency ≥ scenario_floor
# ✓ html_itemids ⊆ ontology_iris
# ✓ self_assessment_people ⊆ org_people
# ✓ basecamp_refs ⊆ ontology_iris
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
python scripts/generate/pipeline.py

# Individual stages
python scripts/generate/pipeline.py --stage org
python scripts/generate/pipeline.py --stage framework
python scripts/generate/pipeline.py --stage content
python scripts/generate/pipeline.py --stage activity
python scripts/generate/pipeline.py --stage personal

# With custom model paths
python scripts/generate/pipeline.py \
  --mlx-model mlx-community/Qwen3-32B-4bit \
  --gguf-model models/qwen3-8b-q6_k.gguf

# Validation only
python scripts/generate/pipeline.py --validate-only
```

## Hardware Requirements

| Resource       | Requirement                      |
| -------------- | -------------------------------- |
| Machine        | Apple Mac Studio M4 Max          |
| Unified Memory | 128 GB (models use ~25 GB total) |
| Disk           | ~20 GB for model weights         |
| Python         | 3.11+ with MLX, llama-cpp-python |
| Node.js        | 18+ (for validation scripts)     |

## Performance Estimate

| Stage                | Model      | Est. Time  |
| -------------------- | ---------- | ---------- |
| Org Skeleton         | Qwen3-32B  | 15 min     |
| Framework YAML       | Qwen3-8B   | 20 min     |
| Scenario Curves      | None (det) | < 1 min    |
| Org Content (HTML)   | Qwen3-32B  | 45 min     |
| Activity Tables      | Mixed      | 10 min     |
| Personal Content     | Qwen3-32B  | 10 min     |
| Validation + Retries | —          | 10 min     |
| **Total**            |            | **~2 hrs** |

## Dependencies

```
# Python
mlx-lm>=0.22
llama-cpp-python>=0.3
pyyaml>=6.0
jinja2>=3.1

# Node.js (existing)
ajv (already in monorepo)
```

## Implementation Phases

### Phase A — Model Setup & Scaffolding (1 day)

- Download and test models on Mac Studio
- Create Python orchestrator with model server management
- Set up output directory structure

### Phase B — Deterministic Generators (1 day)

- Implement signal curve generation
- Implement GitHub event generation (Poisson process)
- Implement DX survey score generation
- Implement organization_people table generation

### Phase C — Framework Generation (2 days)

- Implement YAML generation with grammar constraints
- Validation loop with `npx fit-map validate`
- Generate all Map example files

### Phase D — Content Generation (3 days)

- Implement HTML microdata generation with Qwen3-32B
- Implement ONTOLOGY/README generation
- Implement Basecamp Markdown generation
- HTML microdata parsing and validation

### Phase E — Integration & Cleanup (1 day)

- Cross-content validation
- Remove old hand-crafted content
- Documentation and README updates

## Strengths

- **No API costs**: Zero marginal cost per generation run
- **Fully offline**: No network dependency, runs air-gapped
- **Reproducible**: Same model weights + same seed → similar output
- **Fast iteration**: No rate limits, run as often as needed
- **Privacy**: No data leaves the machine
- **Grammar constraints**: llama.cpp GBNF grammars enforce structural validity

## Weaknesses

- **Lower quality prose**: Open-weight 32B models produce less coherent
  narrative than Claude, especially for complex cross-entity HTML
- **Hardware requirement**: Requires a high-end Apple Silicon machine
- **Setup complexity**: Two model servers, Python + Node.js toolchains
- **Context window limits**: 8K context may require more chunking than Claude's
  200K window
- **Maintenance**: Model versions and quantizations require tracking

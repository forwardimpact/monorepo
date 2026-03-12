# Plan 04 — Template-Driven Deterministic Generation

> Fully deterministic pipeline using template engines, Faker.js, and
> mathematical models — no LLM required. All content is generated from
> parameterized templates with controlled randomness via seeded PRNGs.

## Approach

Replace LLM generation entirely with template-driven content. Use Handlebars
templates for HTML and Markdown, JSON Schema-constrained object builders for
YAML, and statistical models for activity data. A seeded PRNG ensures every run
produces identical output. The entire pipeline runs in Node.js with zero
external dependencies beyond npm packages.

## Architecture

```
seed.yaml ──► Node.js Pipeline
                 │
                 ├── Faker.js (seeded) ─── entity generation
                 │    └── People, orgs, projects, drugs
                 │
                 ├── Handlebars ────────── content templates
                 │    ├── HTML microdata templates
                 │    ├── Markdown templates
                 │    └── YAML templates
                 │
                 ├── Statistical Models ── activity data
                 │    ├── Poisson process (GitHub events)
                 │    ├── Gaussian noise (survey scores)
                 │    └── Signal curves (scenario modulation)
                 │
                 └── Schema Builders ───── framework YAML
                      └── JSON Schema → object → YAML serialization
                 │
                 ▼
            Validator (Ajv + fit-map validate + cross-checks)
```

## Why No LLM

1. **Deterministic**: Identical output every run (seeded PRNG)
2. **Instant**: Full pipeline runs in seconds, not hours
3. **Zero cost**: No API fees, no model downloads
4. **No hardware requirements**: Runs on any machine with Node.js
5. **Testable**: Template output can be unit tested
6. **Debuggable**: Every value traces to a template + seed input

The trade-off is that prose quality is lower — descriptions read like
well-structured fill-in-the-blank text rather than natural language. For
evaluation and testing purposes, structural correctness matters more than
literary quality.

## Seed Data

Same `seed.yaml` structure as other plans, plus additional template parameters:

```yaml
# Additional template configuration
templates:
  prose_style: technical    # technical | narrative | concise
  html_density: high        # low | medium | high (entities per file)
  activity_months: 12       # months of activity data to generate
  prng_seed: 42             # deterministic seed for reproducibility
```

## Template Library

### HTML Microdata Templates

```handlebars
{{! templates/html/article.hbs }}
<article itemscope itemtype="https://schema.org/ScholarlyArticle"
         itemid="{{domain}}/id/article/{{slugify title}}">
  <h3 itemprop="name">{{title}}</h3>
  <meta itemprop="datePublished" content="{{date}}">
  <div itemprop="author" itemscope itemtype="https://schema.org/Person"
       itemid="{{domain}}/id/person/{{slugify author.name}}">
    <span itemprop="name">{{author.name}}</span>
    <span itemprop="jobTitle">{{author.jobTitle}}</span>
  </div>
  <div itemprop="about" itemscope itemtype="https://schema.org/Thing"
       itemid="{{domain}}/id/{{about.type}}/{{slugify about.name}}">
    <span itemprop="name">{{about.name}}</span>
  </div>
  <div itemprop="description">
    {{> article-body topic=about.name department=author.department}}
  </div>
</article>
```

```handlebars
{{! templates/html/partials/article-body.hbs }}
{{#with (selectParagraphs topic 3)}}
<p>{{paragraph1}}</p>
<p>{{paragraph2}}</p>
<p>{{paragraph3}}</p>
{{/with}}
```

### Prose Generation (Template Fragments)

Instead of LLM-generated prose, use a corpus of parameterized sentence templates
organized by topic:

```javascript
// templates/prose/pharma-corpus.js
export const ARTICLE_PARAGRAPHS = {
  drug_discovery: [
    "The {drug} program leverages {platform} to accelerate {phase} development, targeting {indication} through {mechanism}.",
    "Recent advances in {technique} have enabled the {team} to reduce {metric} by {percentage}%, significantly improving {outcome}.",
    "Cross-functional collaboration between {team1} and {team2} has produced {count} novel {artifact_type} since {date}.",
  ],
  clinical_trials: [
    "Phase {phase} trials for {drug} enrolled {count} participants across {sites} clinical sites in {quarter}.",
    "{drug}'s {endpoint} endpoint demonstrated {result} compared to {comparator}, with a p-value of {pvalue}.",
  ],
  manufacturing: [
    "The {facility} facility achieved {metric}% GMP compliance following implementation of {system}.",
    "Batch release times improved from {old_time} to {new_time} days after deploying {platform}.",
  ],
  // ... more topics
}

export function generateParagraph(topic, context, rng) {
  const templates = ARTICLE_PARAGRAPHS[topic]
  const template = templates[rng.nextInt(templates.length)]
  return interpolate(template, context)
}
```

### YAML Templates

```handlebars
{{! templates/yaml/capability.hbs }}
id: {{id}}
name: "{{name}}"
emojiIcon: "{{emoji}}"
ordinalRank: {{rank}}
description: "{{description}}"
professionalResponsibilities:
{{#each levels}}
  {{this.id}}:
    - "{{> responsibility-text level=this scope=(scopeFor this)}}"
{{/each}}
skills:
{{#each skills}}
  - id: {{this.id}}
    name: "{{this.name}}"
    human:
      description: "{{this.description}}"
      proficiencyDescriptions:
{{#each ../levels}}
        {{this.id}}: "{{> proficiency-text skill=../this level=this}}"
{{/each}}
    agent:
      name: "{{kebabCase this.name}}"
      description: "{{this.agentDescription}}"
      useWhen: "{{this.useWhen}}"
      stages:
        plan:
          focus: "{{> stage-focus stage='plan' skill=this}}"
          activities:
            - "{{> stage-activity stage='plan' skill=this index=0}}"
          ready:
            - "{{> stage-ready stage='plan' skill=this index=0}}"
        code:
          focus: "{{> stage-focus stage='code' skill=this}}"
          activities:
            - "{{> stage-activity stage='code' skill=this index=0}}"
          ready:
            - "{{> stage-ready stage='code' skill=this index=0}}"
{{/each}}
```

### Proficiency Description Templates

```javascript
// templates/prose/proficiency-templates.js
export const PROFICIENCY_TEMPLATES = {
  awareness: [
    "You understand the fundamentals of {skill} and can apply basic {technique} with guidance from more experienced engineers.",
    "You are learning {skill} concepts and can use {tool} for simple {task} with support.",
  ],
  foundational: [
    "You apply {skill} principles to create {artifact} for common {context} with minimal guidance.",
    "You identify {issue_type} in {domain} and explain {concept} to peers.",
  ],
  working: [
    "You design {artifact} for {context} independently, making appropriate trade-offs between {tradeoff1} and {tradeoff2}.",
    "You own {responsibility} for your team, troubleshooting {issue_type} across multiple {domain}.",
  ],
  practitioner: [
    "You lead {activity} across teams in your area, mentoring engineers on {skill} and establishing {standard_type}.",
    "You evaluate complex {artifact} involving {context}, setting direction for {scope}.",
  ],
  expert: [
    "You define {standard_type} across the business unit, shaping how the organization approaches {skill}.",
    "You pioneer {technique} that influence {scope}, innovating in {domain} at an enterprise level.",
  ],
}
```

## Entity Generation

### People Generator

```javascript
import { faker } from '@faker-js/faker'

const GREEK_NAMES = [
  'Apollo', 'Artemis', 'Athena', 'Demeter', 'Dionysus', 'Hades',
  'Hephaestus', 'Hera', 'Hermes', 'Poseidon', 'Zeus', 'Aphrodite',
  'Ares', 'Persephone', 'Hestia', 'Iris', 'Nike', 'Pan', 'Eros',
  'Helios', 'Selene', 'Eos', 'Aether', 'Nyx', 'Erebus', 'Gaia',
  'Uranus', 'Cronus', 'Rhea', 'Oceanus', 'Tethys', 'Hyperion',
  'Theia', 'Coeus', 'Phoebe', 'Mnemosyne', 'Themis', 'Crius',
  'Iapetus', 'Atlas', 'Prometheus', 'Epimetheus', 'Metis',
  // ... 211+ names from mythology
]

/**
 * Generate people for a team with deterministic assignment.
 * @param {object} team - Team definition from seed
 * @param {object} distribution - Level distribution percentages
 * @param {object} rng - Seeded PRNG
 * @returns {object[]} Array of person objects
 */
export function generatePeople(team, distribution, rng) {
  const people = []
  const namePool = [...GREEK_NAMES]
  rng.shuffle(namePool)

  for (let i = 0; i < team.members; i++) {
    const name = namePool[i]
    const level = pickFromDistribution(distribution, rng)
    const discipline = pickDiscipline(team, level, rng)

    people.push({
      iri: `/id/person/${name.toLowerCase()}`,
      name,
      email: `${name.toLowerCase()}@bionova.example`,
      jobTitle: JOB_TITLES[discipline][level],
      level,
      discipline,
      team: team.id,
      department: team.department,
      manager: team.manager,
    })
  }
  return people
}
```

### Project Generator

```javascript
export function generateProject(projectSeed, people, rng) {
  const teamMembers = people.filter(p =>
    projectSeed.teams.includes(p.team)
  )
  const lead = teamMembers.find(p => p.level >= 'L3') || teamMembers[0]

  return {
    iri: `/id/project/${projectSeed.id}`,
    name: projectSeed.name,
    type: projectSeed.type,
    lead: lead.iri,
    team: teamMembers.map(p => p.iri),
    timeline: projectSeed.timeline,
    repos: generateRepoNames(projectSeed, rng),
  }
}
```

## Activity Generation

### GitHub Events (Statistical Model)

```javascript
/**
 * Generate GitHub events using a Poisson process modulated by scenario signals.
 * @param {object} person - Person entity
 * @param {Map} signalCurves - Month → signal intensity (0-1)
 * @param {object} rng - Seeded PRNG
 */
export function generateGitHubEvents(person, signalCurves, rng) {
  const events = []
  const baseRate = BASE_RATES[person.discipline][person.level]

  for (const month of MONTHS) {
    const signal = signalCurves.get(month) ?? 0.5
    const dailyRate = baseRate * (0.3 + 1.4 * signal) // Scale 0.3x to 1.7x
    const daysInMonth = getDaysInMonth(month)

    for (let day = 1; day <= daysInMonth; day++) {
      const nEvents = poissonSample(dailyRate, rng)
      for (let e = 0; e < nEvents; e++) {
        events.push({
          timestamp: formatISO(month, day, rng.nextInt(8, 20), rng.nextInt(60)),
          author_email: person.email,
          repo: rng.pick(person.repos),
          event_type: rng.weightedPick(EVENT_TYPE_WEIGHTS),
          additions: Math.max(1, Math.round(rng.gaussian(50, 30))),
          deletions: Math.max(0, Math.round(rng.gaussian(20, 15))),
        })
      }
    }
  }
  return events
}
```

### DX Survey Scores

```javascript
export function generateSurveyScores(team, signalCurves, drivers, rng) {
  const snapshots = []

  for (const month of MONTHS) {
    const signal = signalCurves.get(month) ?? 0.5
    const snapshot = {
      snapshot_id: `snapshot-${team.id}-${month}`,
      date: `${month}-15`,
      team_id: team.id,
      scores: drivers.map(driver => ({
        driver_id: driver.id,
        score: clamp(
          BASELINE_SCORES[driver.id] + (signal - 0.5) * SENSITIVITY[driver.id] + rng.gaussian(0, 3),
          0, 100
        ),
        percentile: null, // Computed in post-processing
      })),
    }
    snapshots.push(snapshot)
  }

  // Compute percentiles across all teams
  computePercentiles(snapshots)
  return snapshots
}
```

## Signal Curve Generation

```javascript
const CURVE_GENERATORS = {
  spike: (t, duration) => Math.exp(-((t - 0.6 * duration) ** 2) / (0.1 * duration ** 2)),
  sustained_high: (t, duration) => 1 / (1 + Math.exp(-10 * (t / duration - 0.3))),
  rising: (t, duration) => t / duration,
  declining: (t, duration) => 1 - t / duration,
  gradual_rise: (t, duration) => Math.sqrt(t / duration),
  elevated: (t, duration) => 0.7 + 0.3 * Math.sin(2 * Math.PI * t / duration),
  moderate: (_t, _duration) => 0.5,
  very_high: (t, duration) => 0.8 + 0.2 * (1 / (1 + Math.exp(-10 * (t / duration - 0.2)))),
}

export function generateSignalCurve(signalType, startMonth, endMonth) {
  const months = monthRange(startMonth, endMonth)
  const generator = CURVE_GENERATORS[signalType]
  return new Map(
    months.map((month, i) => [month, generator(i, months.length)])
  )
}
```

## Cross-Content Validation

```javascript
// scripts/generate/cross-validate.js

export function crossValidate(generatedData) {
  const { people, framework, html, activity, personal } = generatedData
  const errors = []

  // 1. Every person in org HTML exists in activity roster
  const htmlPeople = extractPeopleFromHTML(html)
  const rosterEmails = new Set(activity.roster.map(r => r.email))
  for (const person of htmlPeople) {
    if (!rosterEmails.has(person.email)) {
      errors.push(`Person ${person.name} in HTML but not in roster`)
    }
  }

  // 2. All discipline/level/track combos are valid
  for (const person of activity.roster) {
    if (!isValidCombination(person, framework)) {
      errors.push(`Invalid combo: ${person.discipline}/${person.level}/${person.track}`)
    }
  }

  // 3. GitHub activity correlates with scenario signals
  for (const [teamId, curve] of signalCurves) {
    const teamEvents = activity.github.filter(e =>
      people.find(p => p.email === e.author_email)?.team === teamId
    )
    const correlation = pearsonCorrelation(
      monthlyEventCounts(teamEvents),
      Array.from(curve.values())
    )
    if (correlation < 0.7) {
      errors.push(`GitHub activity for ${teamId} poorly correlated: r=${correlation}`)
    }
  }

  // 4. DX survey scores correlate with scenarios
  // 5. Evidence proficiency >= scenario floor
  // 6. All HTML itemids exist in ontology
  // 7. Self-assessment people exist in org
  // 8. Basecamp refs resolve to ontology IRIs

  return { passed: errors.length === 0, errors }
}
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
# Full pipeline (runs in < 30 seconds)
npx fit-map generate

# With custom seed
npx fit-map generate --seed 42

# Individual stages
npx fit-map generate --stage org
npx fit-map generate --stage framework
npx fit-map generate --stage content
npx fit-map generate --stage activity
npx fit-map generate --stage personal

# Validation only
npx fit-map generate --validate-only

# Diff against previous run
npx fit-map generate --diff
```

## Dependencies

```json
{
  "@faker-js/faker": "^9.0.0",
  "handlebars": "^4.7.0",
  "yaml": "^2.3.0",
  "seedrandom": "^3.0.5"
}
```

No Python. No model downloads. No API keys.

## Implementation Phases

### Phase A — Core Infrastructure (1 day)

- Seeded PRNG wrapper with Gaussian, Poisson, weighted pick
- Handlebars helpers (slugify, kebabCase, scopeFor, selectParagraphs)
- Template directory structure
- YAML serialization with schema validation

### Phase B — Entity Generation (1 day)

- People generator with Greek mythology names
- Organization/department/team generators
- Project and drug generators
- ONTOLOGY.md assembly from entities

### Phase C — Framework Templates (2 days)

- Capability YAML templates with proficiency descriptions
- Discipline, track, behaviour YAML templates
- Levels, stages, drivers, framework templates
- Self-assessment generation
- Validation against `npx fit-map validate`

### Phase D — Content Templates (2 days)

- HTML microdata templates for all 22 content types
- Prose corpus for pharmaceutical domain
- README.md and ONTOLOGY.md templates
- Basecamp Markdown templates

### Phase E — Activity Generation (1 day)

- GitHub event Poisson process
- DX survey score generation
- Evidence statement templates
- Signal curve generators

### Phase F — Integration (1 day)

- Cross-content validation
- CLI integration as `npx fit-map generate`
- Remove old hand-crafted content
- Seed file with all organization parameters

## Strengths

- **Deterministic & reproducible**: Same seed → identical output, every time
- **Blazing fast**: Full pipeline runs in < 30 seconds
- **Zero external dependencies**: No APIs, no models, no network
- **Runs anywhere**: Any machine with Node.js 18+
- **Pure Node.js**: No Python toolchain added to the monorepo
- **Testable**: Template output can be unit tested with snapshots
- **CI-friendly**: Can run in CI to verify data generation works
- **Debuggable**: Every value traces to a template + seed combination

## Weaknesses

- **Formulaic prose**: Generated text is recognizably templated, not natural
  language — reads like "mad libs" rather than authored content
- **Template maintenance burden**: Every new content type requires writing
  templates, prose corpus entries, and schema builders
- **Limited variety**: Output variety is bounded by template count; adding new
  scenarios requires new templates, not just new seed data
- **Prose corpus effort**: Building a realistic pharmaceutical prose corpus
  requires significant domain research upfront
- **No emergent coherence**: Cross-entity narrative coherence must be manually
  encoded in templates rather than emerging from LLM understanding
- **Evidence quality**: Skill marker evidence statements will be generic and
  repetitive without LLM generation

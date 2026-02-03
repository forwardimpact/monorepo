---
applyTo: "**"
---

# Architecture

## 3-Layer System

1. **Model** (`app/model/`) — Pure business logic, derivation, validation
2. **Formatter** (`app/formatters/`) — Entity + context → output (DOM/markdown)
3. **View** (`app/pages/`, `app/commands/`, `app/slides/`) — Route handling,
   render calls

## Data Model

Data lives in YAML files under `data/`. Schema definitions are in `schema/`:

- `schema/json/` — JSON Schema for validating YAML files
- `schema/rdf/` — RDF/SHACL ontology for semantic representation

See `domain-concepts.instructions.md` for entity descriptions and relationships.

## Model Layer

```
model/
  levels.js       # Constants, type helpers (no dependencies)
  modifiers.js    # Skill modifier resolution
  derivation.js   # Core: deriveSkillMatrix, deriveBehaviourProfile, deriveJob
  profile.js      # Post-processing: filtering, sorting for agents
  job.js          # Job preparation for display
  agent.js        # Agent profile/skill generation
  checklist.js    # Stage transition checklists
  interview.js    # Interview question selection
  validation.js   # Data validation
```

**Key distinction**: `derivation.js` provides core logic for all consumers.
`profile.js` adds agent-specific filtering (exclude `isHumanOnly`, keep highest
level only) and sorting.

## Job Derivation

Jobs are derived from `Discipline × Grade × Track?`:

1. Base skill levels from grade (by skill type: primary/secondary/broad)
2. Track modifiers applied to capabilities (+1, 0, -1)
3. Behaviour modifiers combined from discipline and track
4. Responsibilities selected by discipline type (professional/management)

```javascript
import { getOrCreateJob } from "../lib/job-cache.js";
const job = getOrCreateJob({ discipline, grade, track, skills, behaviours });
```

## Agent Profiles

Agent profiles follow the **VS Code Custom Agents** standard (`.agent.md`
files). Generated from `Discipline × Track × Stage` using the same derivation
logic as jobs.

**Output location**: `.github/agents/{id}.agent.md`

Profile includes:

- **Frontmatter**: name, description, tools, handoffs, infer
- **Core identity**: From discipline/track `agent.coreInstructions`
- **Capabilities**: Derived from skill matrix (filtered, sorted by level)
- **Stage context**: Tools, constraints, entry/exit criteria
- **Working style**: From behaviour `agent.workflow` sections
- **Delegation**: Subagent guidance
- **Constraints**: Combined from discipline, track, stage

See [templates/agent.template.md](../../templates/agent.template.md).

## Agent Skills

Agent skills follow the **SKILL.md** standard (Claude Code compatible). Each
skill with an `agent:` section generates a skill file.

**Output location**: `.claude/skills/{skill-name}/SKILL.md`

Skill file includes:

- **Frontmatter**: name, description (triggering conditions)
- **Stage guidance**: Plan/Code/Review activities and readiness checklists
- **Reference**: Project-specific guidance (not generic best practices)

See [templates/skill.template.md](../../templates/skill.template.md).

## Formatter Layer

Single place for all presentation logic:

```
formatters/{entity}/
  shared.js    # Helpers shared between outputs
  dom.js       # Entity → DOM elements
  markdown.js  # Entity → markdown string
```

**Rule**: Pages/commands pass raw entities to formatters—no transforms in views.

## Key Patterns

```javascript
// Builder pages (discipline/grade/track selector)
import { createBuilder } from "../components/builder.js";

// Reactive state (component-local)
import { createReactive } from "../lib/reactive.js";
const state = createReactive(initial);
state.subscribe((value) => updateUI(value));

// DOM rendering (no innerHTML)
import { div, h2, p, render } from "./lib/render.js";

// Global state
import { getState, setData, subscribe } from "./lib/state.js";
```

## Error Handling

Router wraps all pages with error boundary. Pages throw `NotFoundError` or
`InvalidCombinationError` as needed.

---
name: libskill
description: >
  Use when deriving a job from Discipline × Level × Track, generating an agent
  profile or skill file, computing a skill matrix or behaviour profile from
  capability data, applying skill modifiers, producing stage transition
  checklists, selecting interview questions by role, analysing career
  progression between levels, or matching candidates to jobs.
---

# Libskill Package

Pure business logic for deriving jobs, agent profiles, skill matrices, and
career progression from schema data.

## When to Use

- Modifying job derivation logic (skill proficiencies, behaviour maturities)
- Changing agent profile generation
- Working with skill modifier resolution
- Updating checklist derivation for stage transitions
- Modifying interview question selection
- Changing career progression analysis

## Package Structure

```
libraries/libskill/
  src/
    derivation.js   # Core: deriveSkillMatrix, deriveBehaviourProfile, deriveJob
    modifiers.js    # Skill modifier resolution
    profile.js      # Post-processing: filtering, sorting for agents
    job.js          # Job preparation for display
    job-cache.js    # Job caching for pages
    agent.js        # Agent profile/skill generation
    checklist.js    # Stage transition checklists
    interview.js    # Interview question selection
    matching.js     # Job matching logic
    progression.js  # Career progression analysis
    policies/       # Ordering, filtering, threshold policies
```

## Key Modules

### derivation.js

Core derivation functions used by all consumers.

```javascript
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveJob,
} from "@forwardimpact/libskill/derivation";
```

### profile.js

Agent-specific filtering and sorting:

- Excludes `isHumanOnly` skills
- Keeps only highest proficiency per skill
- Sorts by proficiency (highest first)

```javascript
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";
```

### job.js / job-cache.js

Job preparation and caching for web pages. `prepareJobDetail` transforms a raw
derived job into a view model for the job page. Key fields:

- `skillMatrix` — raw skill matrix from derivation
- `behaviourProfile` — raw behaviour profile from derivation
- `derivedResponsibilities` — responsibilities sorted by proficiency desc, skill
  count desc, ordinal rank (used by job description formatter)
- `capabilityOrder` — `string[]` of capability IDs in display order, derived
  from `derivedResponsibilities`. Use this when ordering skills by capability
  instead of extracting order from `derivedResponsibilities` directly.
- `toolkit` — de-duplicated tools from skill references
- `checklists` — stage handoff checklists

```javascript
import { prepareJobDetail } from "@forwardimpact/libskill/job";
import { createJobCache } from "@forwardimpact/libskill/job-cache";
```

### agent.js

Agent profile and skill file generation.

```javascript
import {
  deriveAgentSkills,
  generateStageAgentProfile,
} from "@forwardimpact/libskill/agent";
```

### interview.js

Question selection based on role requirements.

### progression.js

Career progression analysis between levels.

## Job Derivation

Jobs are derived from `Discipline × Level × Track?`:

1. Base skill proficiencies from level (by skill type: primary/secondary/broad)
2. Track modifiers applied to capabilities (+1, 0, -1)
3. Behaviour modifiers combined from discipline and track
4. Responsibilities by discipline type (professional/management)

```
Final Proficiency = clamp(Base Proficiency + Track Modifier, awareness, level ceiling)
```

## Agent Profiles

Agent profiles use the same derivation as jobs, filtered for AI-applicable
capabilities:

```
Agent Profile = Discipline × Track × Stage
```

- Uses practitioner-level reference level
- Excludes `isHumanOnly` skills
- Constrained by stage tools and permissions

## Pure Functions

All derivation functions are pure — no side effects, same inputs produce same
outputs, no external state access. This is intentional and makes libskill the
only library exempt from the OO+DI pattern used everywhere else. Do not add
classes or constructor injection to libskill.

## Composition Patterns

### With map (upstream data)

Map provides the YAML schema data that libskill consumes. Derivation functions
accept raw entities loaded from `data/pathway/`:

```javascript
import { deriveJob } from "@forwardimpact/libskill/derivation";

// discipline, level, track, capabilities, behaviours all loaded from YAML
const job = deriveJob(discipline, level, track, capabilities, behaviours);
```

### With pathway (downstream presentation)

Pathway formatters consume libskill's derived output for display:

```javascript
import { deriveSkillMatrix } from "@forwardimpact/libskill/derivation";
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";

// Derive raw data
const matrix = deriveSkillMatrix(discipline, level, capabilities);

// Filter for agent context
const agentProfile = prepareAgentProfile(matrix);

// Pass to pathway formatters (never transform in views)
renderSkillMatrix(matrix);
```

### With basecamp (agent generation)

Basecamp uses libskill to generate agent profiles and skill files:

```javascript
import { deriveAgentSkills, generateStageAgentProfile } from "@forwardimpact/libskill/agent";

const skills = deriveAgentSkills(discipline, track, stage, capabilities);
const profile = generateStageAgentProfile(discipline, track, stage);
```

## Verification

Run tests after changes:

```sh
bun run test
```

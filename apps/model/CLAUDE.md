# Model Package

## Package Structure

```
apps/model/src/
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
```

## Key Modules

### derivation.js

Core derivation functions used by all consumers.

```javascript
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveJob,
} from "@forwardimpact/model/derivation";
```

### profile.js

Agent-specific filtering and sorting:

- Excludes `isHumanOnly` skills
- Keeps only highest level per skill
- Sorts by level (highest first)

### job.js / job-cache.js

Job preparation and caching for web pages.

```javascript
import { getOrCreateJob } from "@forwardimpact/model/job-cache";
```

### agent.js

Agent profile and skill file generation.

```javascript
import {
  deriveAgentSkills,
  generateStageAgentProfile,
} from "@forwardimpact/model/agent";
```

### profile.js

Unified profile derivation for jobs and agents.

```javascript
import { prepareAgentProfile } from "@forwardimpact/model/profile";
```

### interview.js

Question selection based on role requirements.

### progression.js

Career progression analysis between grades.

## Job Derivation

Jobs are derived from `Discipline × Grade × Track?`:

1. Base skill levels from grade (by skill type: primary/secondary/broad)
2. Track modifiers applied to capabilities (+1, 0, -1)
3. Behaviour modifiers combined from discipline and track
4. Responsibilities by discipline type (professional/management)

```
Final Level = clamp(Base Level + Track Modifier, awareness, grade ceiling)
```

## Agent Profiles

Agent profiles use the same derivation as jobs, filtered for AI-applicable
capabilities:

```
Agent Profile = Discipline × Track × Stage
```

- Uses practitioner-level reference grade
- Excludes `isHumanOnly` skills
- Constrained by stage tools and permissions

## Pure Functions

All derivation functions are pure:

- No side effects
- Same inputs → same outputs
- No external state access

This makes them easy to test and reason about.

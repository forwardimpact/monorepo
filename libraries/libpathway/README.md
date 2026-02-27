# @forwardimpact/libpathway

Derivation engine for roles, skills, and agent team profiles.

## Role in the Vision

The model package contains the core logic that transforms raw data into
actionable role definitions. Whether you're generating a human job description
or a coding agent team profile, the same derivation engine ensures consistent
expectations across both.

## What It Does

- **Job derivation** — Combine discipline, track, and level into complete role
  definitions with skill matrices and behaviour profiles
- **Agent profiles** — Generate coding agent team configurations from the same
  foundation as human roles
- **Interview preparation** — Select appropriate questions based on role
  requirements
- **Career progression** — Analyze skill gaps and growth paths between levels
- **Checklists** — Derive stage transition checklists from capability
  definitions

## Usage

```javascript
import {
  deriveJob,
  deriveSkillMatrix,
  deriveBehaviourProfile,
} from "@forwardimpact/libpathway/derivation";
import { prepareAgentProfile } from "@forwardimpact/libpathway/profile";
import { deriveInterviewQuestions } from "@forwardimpact/libpathway/interview";
import { analyzeProgression } from "@forwardimpact/libpathway/progression";
```

## Key Concepts

### Job Derivation

```
Job = Discipline × Track × Level
```

- **Discipline** defines skill tiers (primary/secondary/broad)
- **Track** applies modifiers to capability areas
- **Level** sets base skill proficiencies

### Agent Profiles

```
Agent = Discipline × Track × Stage
```

Uses the same skill derivation but filtered for AI-applicable capabilities and
constrained by lifecycle stage (plan, code, review).

## Package Exports

| Export        | Purpose                     |
| ------------- | --------------------------- |
| `derivation`  | Core derivation functions   |
| `agent`       | Agent profile generation    |
| `interview`   | Question selection          |
| `job`         | Job preparation for display |
| `job-cache`   | Caching for pages           |
| `progression` | Career path analysis        |
| `checklist`   | Stage transition checklists |
| `matching`    | Role matching logic         |

See the [documentation](../../docs/model/index.md) for derivation details.

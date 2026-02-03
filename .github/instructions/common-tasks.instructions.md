---
applyTo: "**"
---

# Common Tasks

> **Data-Driven Application**: All entity IDs (skills, disciplines, tracks,
> grades, behaviours) shown in examples are for illustration only. The actual
> available values depend on the YAML files in `data/`. Always use
> `npx pathway <entity> --list` to discover what's available in the current
> installation.

## Add Skill

1. Add skill to the appropriate capability file
   `data/capabilities/{capability_id}.yaml`
2. Add skill object to the `skills:` array with `id`, `name`, and `human:`
   section
3. Include level descriptions for all five levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions to `data/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npm run validate`

## Add or Modify Interview Questions

Questions live in `data/questions/` with one file per skill/behaviour.

### File Location

- Skills: `questions/skills/{skill_id}.yaml`
- Behaviours: `questions/behaviours/{behaviour_id}.yaml`

### Question Properties

| Property                  | Required | Description                                            |
| ------------------------- | -------- | ------------------------------------------------------ |
| `id`                      | Yes      | Format: `{abbrev}_{level_abbrev}_{number}`             |
| `text`                    | Yes      | The question text (second person, under 150 chars)     |
| `lookingFor`              | Yes      | 2-4 bullet points of good answer indicators            |
| `expectedDurationMinutes` | No       | Default: 5 for awareness/foundational, 8-10 for higher |
| `followUps`               | No       | 1-3 probing questions for deeper exploration           |

### Skill Level Progression Patterns

| Level        | Scope               | Question Pattern                                           |
| ------------ | ------------------- | ---------------------------------------------------------- |
| awareness    | Learning            | "What do you understand about X?"                          |
| foundational | Applying basics     | "How do you X in your work?"                               |
| working      | Handles complexity  | "Describe X you've done. What trade-offs?"                 |
| practitioner | Leads and mentors   | "How have you improved X in your team?"                    |
| expert       | Shapes org practice | "How have you shaped X standards across the organization?" |

### Behaviour Maturity Progression Patterns

| Maturity      | Scope                 | Question Pattern                              |
| ------------- | --------------------- | --------------------------------------------- |
| emerging      | Individual interest   | "What X have you noticed/tried?"              |
| developing    | Regular practice      | "Tell me about a time when X"                 |
| practicing    | Consistent, proactive | "How do you approach X?"                      |
| role_modeling | Influences team       | "How do you help others/foster X?"            |
| exemplifying  | Shapes org culture    | "How do you shape X across the organization?" |

### Adding Questions

1. Open `questions/skills/{skill_id}.yaml` or
   `questions/behaviours/{behaviour_id}.yaml`
2. Add question to appropriate level/maturity section
3. Follow ID convention: `{abbrev}_{level_abbrev}_{number}`
4. Run `npm run validate` to verify

### Browsing Questions

Use the questions CLI command to compare and analyse questions:

```sh
# See all practitioner-level skill questions
npx pathway questions --level=practitioner

# See all role_modeling behaviour questions
npx pathway questions --maturity=role_modeling

# Question count statistics
npx pathway questions --stats

# Deep dive on a single skill (use actual skill ID from your installation)
npx pathway questions --skill=<skill_id>

# Export as YAML for bulk editing
npx pathway questions --level=practitioner --format=yaml > practitioner-questions.yaml
```

## Add Derivation Function

1. Add pure function to `app/model/derivation.js`
2. Add tests in `tests/model.test.js`
3. Document with JSDoc

## Add Agent Skill

1. Add `agent:` section to skill in `data/capabilities/{capability_id}.yaml`
2. Include required fields: `name`, `description`, `body`
3. Description should specify when to use the skill
4. Body should focus on project-specific guidance, not generic best practices
5. Run `npm run validate` to verify

Example structure:

```yaml
agent:
  name: skill-name-kebab-case
  description: |
    Guide for [task]. Use when [triggering conditions].
  body: |
    # Skill Name

    ## When to use this skill
    ...

    ## Project-Specific Guidance
    ...
```

## Generate Agent Profile

Agent profiles are generated from discipline × track × stage combinations. Use
`npx pathway agent --list` to see valid combinations in your installation.

```sh
# Generate default agent
npx pathway agent <discipline> --track=<track> --output=./agents

# Generate stage-specific agent
npx pathway agent <discipline> --track=<track> --stage=plan --output=./agents

# Generate all stage variants
npx pathway agent <discipline> --track=<track> --all-stages --output=./agents

# Preview without writing files (outputs to console)
npx pathway agent <discipline> --track=<track> --stage=plan

# List available combinations
npx pathway agent --list
```

## Add Agent Discipline or Track

1. Add configuration to `data/disciplines/agent.yaml` or
   `data/tracks/agent.yaml`
2. Ensure `id` matches the corresponding human definition
3. Include required fields (see existing entries for examples)
4. Run `npm run validate` to verify

## CLI Usage

The CLI follows consistent patterns across all commands:

| Mode     | Pattern                    | Description                         |
| -------- | -------------------------- | ----------------------------------- |
| Summary  | `npx pathway <command>`    | Concise overview with stats         |
| List     | `npx pathway <cmd> --list` | IDs only, one per line (for piping) |
| Detail   | `npx pathway <cmd> <id>`   | Full entity details                 |
| Validate | `npx pathway --validate`   | Run all data validation checks      |

### Getting Started

```sh
npx pathway init                       # Create ./data/ with example data
npx pathway serve                      # Serve web app at http://localhost:3000
npx pathway serve --port=8080          # Custom port
npx pathway site --output=./site       # Generate static site
```

### Entity Commands

```sh
# Summary view (default)
npx pathway skill
npx pathway behaviour
npx pathway discipline
npx pathway grade
npx pathway track
npx pathway driver
npx pathway stage

# List IDs for piping (discover available entities)
npx pathway skill --list
npx pathway job --list | head -5

# Detail view (use actual IDs from your installation)
npx pathway skill <skill_id>
npx pathway discipline <discipline_id>

# Agent SKILL.md output (for skills with agent section)
npx pathway skill <skill_id> --agent
```

### Composite Commands

Job, interview, and progress commands take discipline and grade as positional
arguments. Track is optional via `--track=<track>`. Use
`npx pathway <entity> --list` to discover available values.

```sh
# Job definition
npx pathway job                                    # Summary
npx pathway job --list                             # All valid combinations
npx pathway job <discipline> <grade>               # Full specification (trackless)
npx pathway job <discipline> <grade> --track=<track>  # With track
npx pathway job <discipline> <grade> --track=<track> --checklist=code

# Interview questions
npx pathway interview <discipline> <grade>
npx pathway interview <discipline> <grade> --track=<track> --type=short

# Career progression
npx pathway progress <discipline> <grade>
npx pathway progress <discipline> <from_grade> --track=<track> --compare=<to_grade>
```

### Questions Commands

```sh
# Summary
npx pathway questions

# Filter and browse (level/maturity names are fixed in the model)
npx pathway questions --level=practitioner
npx pathway questions --maturity=role_modeling
npx pathway questions --skill=<skill_id>        # Use actual skill ID
npx pathway questions --behaviour=<behaviour_id>
npx pathway questions --capability=<capability>
npx pathway questions --stats

# Export
npx pathway questions --list                       # Question IDs for piping
npx pathway questions --format=yaml > questions.yaml
```

### Agent Commands

Agent commands use `--track` as an option (not positional).

```sh
# Summary
npx pathway agent

# List combinations (discover what's available in your installation)
npx pathway agent --list

# Generate files (use actual discipline and track IDs)
npx pathway agent <discipline>
npx pathway agent <discipline> --track=<track>
npx pathway agent <discipline> --track=<track> --output=./agents

# Stage variants (plan, code, review)
npx pathway agent <discipline> --track=<track> --stage=plan
npx pathway agent <discipline> --track=<track> --all-stages
```

### Validation

```sh
# Full validation (replaces npm run validate)
npx pathway --validate

# Output as JSON (use actual IDs from your installation)
npx pathway skill --json
npx pathway job <discipline> <grade> --json
npx pathway job <discipline> <grade> --track=<track> --json
```

## NPM Scripts

- `npm run validate` — Validate data files (alias for `npx pathway --validate`)
- `npm start` — Start local web app at http://localhost:3000/
- `npm run demo` — Run demo script

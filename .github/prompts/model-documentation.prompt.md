# Document the Data Model

Generate comprehensive documentation of the Engineering Pathway data model in
`MODEL.md`. This documentation should explain how data entities relate and how
human job profiles and agent profiles are derived.

**IMPORTANT:** Document the _model structure and derivation logic_, NOT the
specific data values. The actual disciplines, tracks, grades, skills,
categories, behaviours, and drivers will vary between installations—what remains
constant is how these entity types are structured, how they relate, and how
profiles are derived.

## Your Task

Read the actual source code and data files to produce accurate, current
documentation. Do not rely on existing documentation—verify everything against
the implementation.

## Files to Study

Read these files to understand the model:

### Core Model Files

- `app/model/levels.js` - Skill levels, behaviour maturities, enums
- `app/model/derivation.js` - Job derivation logic (the heart of the system)
- `app/model/agent.js` - Agent profile generation
- `app/model/modifiers.js` - Capability-based skill modifier expansion
- `app/model/loader.js` - Data loading and structure

### Data Files

- `examples/grades.yaml` - Grade definitions with base levels
- `examples/categories.yaml` - Skill categories and responsibility matrices
- `examples/disciplines/human.yaml` - Discipline T-shaped profiles
- `examples/tracks/human.yaml` - Track modifiers and constraints
- `examples/behaviours/human.yaml` - Behaviour maturity descriptions
- `examples/skills/*.yaml` - Skill definitions (sample a few)

### Agent Data Files

- `examples/disciplines/agent.yaml` - Agent discipline instructions
- `examples/tracks/agent.yaml` - Agent track context and tools
- `examples/behaviours/agent.yaml` - Agent behaviour interaction patterns

## Documentation Structure

The `MODEL.md` document should cover these areas (adapt structure as needed
based on what you discover):

### 1. Overview

Brief introduction to what the pathway is and its dual purpose (human roles + AI
agents). Include the core derivation formula.

### 2. Entity Relationships

Document the core entities and how they relate:

- Disciplines, Tracks, Grades, Skills, Categories, Behaviours, Drivers
- Use a diagram or clear, prose to show relationships
- Explain the purpose of each entity

### 3. Human Job Profile Derivation

This is the key section. Explain step-by-step how a job profile is derived:

- The formula: `Job = Discipline × Track × Grade`
- How skill levels are calculated (base level + modifiers + capping)
- How behaviour maturities are calculated (base + discipline + track modifiers)
- How responsibilities are derived from categories
- Include concrete examples with actual data values

### 4. Skill Modifier System

Explain the capability-based modifier system:

- How tracks define modifiers by capability (not individual skills)
- How modifiers expand to all skills in a capability
- The capping rules for positive modifiers
- Examples of how modifiers shape role identity

### 5. Agent Profile Derivation

Explain how AI agents are generated:

- How the reference grade is derived (first practitioner-level grade)
- How agent skills are filtered (tacit skills excluded)
- How agent behaviours influence working style
- Profile structure (frontmatter, body sections)
- Role variants (plan, review) and their purpose

### 6. Data File Formats

Document the structure of key YAML files:

- Skill file structure (human + agent sections)
- Discipline file structure (primary/secondary/broad skills)
- Track file structure (modifiers, constraints)
- Show how human and agent data co-exist

### 7. Key Functions Reference

Brief reference to the main derivation functions:

- `deriveSkillLevel()` - Single skill derivation
- `deriveSkillMatrix()` - Complete skill profile
- `deriveBehaviourMaturity()` - Single behaviour derivation
- `deriveBehaviourProfile()` - Complete behaviour profile
- `deriveJob()` - Full job derivation
- `generateStageAgentProfile()` - Stage agent profile generation
- `deriveAgentSkills()` / `deriveAgentBehaviours()` - Agent derivation

## Guidelines

- Read the actual source code—don't guess
- Use concrete examples from the real data files
- Include actual modifier values from tracks
- Show the math for derivation calculations
- Keep explanations clear and concise
- Use code blocks for function signatures and examples
- Use tables where they aid clarity
- Use Mermaid diagrams to visualize entity relationships and derivation flows
- For Mermaid diagrams, prefer flowcharts (`graph TD`) for processes and entity
  relationship diagrams (`erDiagram`) for data relationships

## Output

Write the documentation to `MODEL.md` in the repository root. The document
should be self-contained and useful for:

1. New contributors understanding the system
2. AI agents working with the codebase
3. Reference during development

# Engineering Pathway

A unified framework for human and AI collaboration in engineering. Define roles,
track skills and behaviours, build career paths, and generate AI coding
agents—all from the same coherent foundation.

## Quick Start

### Install as a Package

```sh
# Create a new project
mkdir my-org-pathway && cd my-org-pathway
npm init -y
npm install @forwardimpact/pathway

# Initialize with example data
npx pathway init

# Validate data
npx pathway --validate

# Start web app
npx pathway serve
```

Open http://localhost:3000 to explore jobs, skills, and behaviours.

### For Development

Clone the repository and run locally:

```sh
git clone https://github.com/forwardimpact/pathway.git
cd pathway
npm install
npm start
```

## Customization

Edit files in `./data/` to match your organization:

- `grades.yaml` — Career levels
- `disciplines/*.yaml` — Engineering disciplines
- `tracks/*.yaml` — Role tracks (platform, frontend, etc.)
- `skills/*.yaml` — Technical skills with level descriptions
- `behaviours/*.yaml` — Behavioural expectations

## CLI Reference

```sh
# Getting started
npx pathway init                      # Create ./data/ with examples
npx pathway serve --port=8080         # Serve web app

# Browse data
npx pathway skill                     # Summary of all skills
npx pathway skill --list              # Skill IDs for piping
npx pathway job software_engineering platform senior

# Generate outputs
npx pathway interview software_engineering platform L4
npx pathway agent software_engineering platform --output=./.github/agents

# Validation
npx pathway --validate                # Validate all data files
npx pathway --help                    # Full command reference
```

## API Usage

```javascript
import { loadAllData } from "@forwardimpact/pathway";
import { deriveJob } from "@forwardimpact/pathway/derivation";

const data = await loadAllData("./data");
const job = deriveJob({
  discipline: data.disciplines[0],
  track: data.tracks[0],
  grade: data.grades[0],
  skills: data.skills,
  behaviours: data.behaviours,
});
```

## Documentation

1. [Overview](docs/index.md) — Overview of all topics
2. [Core Model](docs/model.md) — Disciplines, Tracks, Grades, Skills,
   Behaviours, Capabilities, Drivers, and Job Derivation
3. [Lifecycle](docs/lifecycle.md) — Stages, handoffs, and checklists (applies to
   both humans and agents)
4. [Agents](docs/agents.md) — Agent profile derivation, SKILL.md format, and VS
   Code integration
5. [Reference](docs/reference.md) — File organization, templates, and CLI usage

## Development

```sh
npm run check      # Format, lint, and test
npm run validate   # Validate YAML data files
npm run test:e2e   # Run end-to-end tests
```

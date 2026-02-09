# @forwardimpact/pathway

Career progression web app and CLI for exploring roles and generating agent
teams.

## Role in the Vision

Pathway is the primary interface for interacting with engineering competency
data. It provides tools for browsing career paths, generating job descriptions,
creating agent team profiles, and preparing interviews—all from a unified web
experience and command line.

## What It Does

- **Web application** — Interactive browser for jobs, skills, and career paths
- **CLI tools** — Command-line access to all functionality
- **Agent generation** — Create VS Code Custom Agent profiles (`.agent.md`)
- **Skill generation** — Generate Agent Skills files (`SKILL.md`)
- **Interview prep** — Build interview question sets by role
- **Static site** — Export everything as a static site

## Quick Start

```sh
# Start the web app
npx fit-pathway serve

# Browse entities
npx fit-pathway skill --list
npx fit-pathway job software_engineering senior --track=platform

# Generate agent profiles
npx fit-pathway agent software_engineering --track=platform --output=./.github/agents
```

## CLI Commands

| Command     | Description                  |
| ----------- | ---------------------------- |
| `serve`     | Start web server             |
| `site`      | Generate static site         |
| `init`      | Create data directory        |
| `skill`     | Browse skills                |
| `behaviour` | Browse behaviours            |
| `job`       | Generate job definitions     |
| `agent`     | Generate agent profiles      |
| `interview` | Generate interview questions |
| `progress`  | Analyze career progression   |
| `questions` | Browse interview questions   |

Use `--help` with any command for full options.

## Web App Features

- **Job Builder** — Select discipline, track, and grade to explore roles
- **Skill Browser** — View all skills with level descriptions
- **Career Progression** — Compare grades and identify growth areas
- **Interview Prep** — Generate role-specific question sets
- **Agent Preview** — Preview generated agent profiles

## Package Exports

```javascript
import { formatSkillForMarkdown } from "@forwardimpact/pathway/formatters";
import { runCommand } from "@forwardimpact/pathway/commands";
```

See the [documentation](../../docs/pathway/index.md) for usage details.

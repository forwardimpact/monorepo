---
title: Pathway
description: Web app, CLI, formatters, agent output, and presentation layer reference.
---

## Overview

Pathway is the presentation layer of the FIT suite. It formats derived data into
web pages, CLI output, markdown documents, and agent configuration files.

> See the [Pathway product page](/pathway/) for a high-level overview.

---

## Architecture

```
Map (data) → Model (derivation) → Presentation (display)
```

Pathway receives fully derived data from `@forwardimpact/libpathway` and formats
it for display. Pathway never performs derivation — it only presents.

### Module Structure

```
products/pathway/src/
├── commands/       # CLI command handlers
├── components/     # Reusable UI components
├── css/            # Stylesheets
├── formatters/     # Output formatting (core layer)
│   ├── agent/      # Agent profile formatters
│   ├── behaviour/  # Behaviour formatters
│   ├── capability/ # Capability formatters
│   ├── checklist/  # Checklist formatters
│   ├── discipline/ # Discipline formatters
│   ├── driver/     # Driver formatters
│   ├── level/      # Level formatters
│   ├── job/        # Job definition formatters
│   ├── skill/      # Skill formatters
│   ├── stage/      # Stage formatters
│   └── track/      # Track formatters
├── lib/            # Shared utilities
├── pages/          # Web page modules
└── slides/         # Presentation slides
```

---

## Formatter Pattern

Every entity has three formatter files:

| File          | Purpose                                  | Imports   |
| ------------- | ---------------------------------------- | --------- |
| `shared.js`   | Pure text transforms (no DOM)            | None      |
| `dom.js`      | DOM element creation for web UI          | shared.js |
| `markdown.js` | Markdown string generation for CLI/files | shared.js |

### Rules

1. **All presentation logic lives in formatters** — pages and commands call
   formatters, never transform data themselves
2. **shared.js has no side effects** — pure functions only
3. **dom.js creates elements** — returns DOM nodes
4. **markdown.js returns strings** — returns markdown text

### Example

```javascript
// formatters/skill/shared.js
export function formatSkillProficiency(level) {
  return level.replace(/_/g, " ");
}

// formatters/skill/dom.js
import { formatSkillProficiency } from "./shared.js";
export function createSkillBadge(level) {
  const span = document.createElement("span");
  span.textContent = formatSkillProficiency(level);
  span.className = `badge badge-${level}`;
  return span;
}

// formatters/skill/markdown.js
import { formatSkillProficiency } from "./shared.js";
export function skillProficiencyMarkdown(level) {
  return `**${formatSkillProficiency(level)}**`;
}
```

---

## Web Application

The web app is a single-page application that loads data and renders pages
client-side.

### Pages

| Page       | URL Pattern                         | Displays                              |
| ---------- | ----------------------------------- | ------------------------------------- |
| Landing    | `/`                                 | Overview and navigation               |
| Discipline | `/discipline/{id}`                  | Discipline details                    |
| Job        | `/job/{discipline}/{level}/{track}` | Full job definition                   |
| Skill      | `/skill/{id}`                       | Skill details with level descriptions |
| Behaviour  | `/behaviour/{id}`                   | Behaviour with maturity descriptions  |
| Stage      | `/stage/{id}`                       | Lifecycle stage details               |

### Components

Shared UI components used across pages:

- Skill matrix tables
- Behaviour profile displays
- Navigation elements
- Entity cards and lists

---

## CLI Commands

The `fit-pathway` CLI provides terminal access to all derived data.

### Entity Browsing

```sh
npx fit-pathway skill --list           # List all skills
npx fit-pathway discipline --list      # List all disciplines
npx fit-pathway level --list           # List all levels
npx fit-pathway track --list           # List all tracks
npx fit-pathway behaviour --list       # List all behaviours
npx fit-pathway capability --list      # List all capabilities
npx fit-pathway stage --list           # List all stages
npx fit-pathway driver --list          # List all drivers
npx fit-pathway tool --list            # List all derived tools
```

### Job Definitions

```sh
# Generate a job definition
npx fit-pathway job <discipline> <level> --track=<track>

# Example
npx fit-pathway job software_engineering L3 --track=platform
```

### Agent Profiles

```sh
# Generate agent team for a discipline
npx fit-pathway agent <discipline> --track=<track> --output=./agents

# Output structure:
# ./agents/
#   ├── plan.agent.md
#   ├── code.agent.md
#   ├── review.agent.md
#   └── skills/
#       ├── SKILL-NAME.md
#       └── ...
```

---

## Templates

Agent output uses Mustache templates:

```
products/pathway/templates/
├── agent.md.mustache       # Agent profile template
├── skill.md.mustache       # Skill document template
└── ...
```

Templates receive derived data and produce markdown files suitable for AI coding
assistants (GitHub Copilot, Claude, etc.).

---

## Related Documentation

- [Agents](/docs/pathway/agents/) — Agent profile derivation
- [Technical Reference](/docs/pathway/reference/) — File organization and CLI
  reference
- [Core Model](/docs/model/) — How derivation works

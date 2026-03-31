---
title: Pathway Internals
description: "Presentation layer architecture — module structure, formatter pattern, web application, templates, and agent derivation."
---

## Architecture

```
Map (data) -> Model (derivation) -> Presentation (display)
```

Pathway receives fully derived data from `@forwardimpact/libskill` and formats
it for display. Pathway never performs derivation -- it only presents.

---

## Module Structure

```
products/pathway/src/
  commands/       CLI command handlers
  components/     Reusable UI components
  css/            Stylesheets
  formatters/     Output formatting (core layer)
    agent/        Agent profile formatters
    behaviour/    Behaviour formatters
    discipline/   Discipline formatters
    driver/       Driver formatters
    interview/    Interview question formatters
    job/          Job definition formatters
    level/        Level formatters
    progress/     Progression formatters
    questions/    Question formatters
    skill/        Skill formatters
    stage/        Stage formatters
    tool/         Tool formatters
    toolkit/      Toolkit formatters
    track/        Track formatters
  lib/            Shared utilities
  pages/          Web page modules
  slides/         Presentation slides
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

1. **All presentation logic lives in formatters** -- pages and commands call
   formatters, never transform data themselves
2. **shared.js has no side effects** -- pure functions only
3. **dom.js creates elements** -- returns DOM nodes
4. **markdown.js returns strings** -- returns markdown text

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

### Available Formatters

| Entity     | Directory                | Key Exports                        |
| ---------- | ------------------------ | ---------------------------------- |
| Agent      | `formatters/agent/`      | Profile, skill document formatting |
| Behaviour  | `formatters/behaviour/`  | Maturity display, profile tables   |
| Discipline | `formatters/discipline/` | Discipline cards, tier display     |
| Driver     | `formatters/driver/`     | Coverage display, driver cards     |
| Interview  | `formatters/interview/`  | Interview question formatting      |
| Job        | `formatters/job/`        | Full job document formatting       |
| Level      | `formatters/level/`      | Level badges, level tables         |
| Progress   | `formatters/progress/`   | Progression and gap formatting     |
| Questions  | `formatters/questions/`  | Question display formatting        |
| Skill      | `formatters/skill/`      | Level badges, matrix tables        |
| Stage      | `formatters/stage/`      | Stage cards, lifecycle flow        |
| Tool       | `formatters/tool/`       | Tool list formatting               |
| Toolkit    | `formatters/toolkit/`    | Toolkit grouping and display       |
| Track      | `formatters/track/`      | Modifier display, track cards      |

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

## File Organization

### Map (`products/map/`)

Data model, validation, and loading.

| File                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `src/loader.js`            | YAML file loading and parsing                               |
| `src/validation.js`        | Referential integrity and data validation                   |
| `src/schema-validation.js` | JSON Schema validation                                      |
| `src/levels.js`            | Type definitions, skill proficiencies, behaviour maturities |
| `src/modifiers.js`         | Capability and skill modifier utilities                     |
| `src/index-generator.js`   | Browser index generation                                    |
| `src/index.js`             | Public API exports                                          |

### Model (`libraries/libskill/`)

Pure business logic and derivation.

| File             | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `derivation.js`  | Core derivation functions (skills, behaviours, drivers) |
| `agent.js`       | Agent team and skill generation                         |
| `job.js`         | Job preparation for display                             |
| `job-cache.js`   | Job caching for performance                             |
| `profile.js`     | Unified profile derivation (human + agent)              |
| `modifiers.js`   | Capability and skill modifier resolution                |
| `checklist.js`   | Stage transition checklist derivation                   |
| `toolkit.js`     | Tool derivation from skill references                   |
| `interview.js`   | Interview question selection                            |
| `progression.js` | Career path analysis and gap identification             |
| `matching.js`    | Job matching and gap analysis                           |
| `policies/`      | Filtering, sorting, and threshold policies              |

### Pathway (`products/pathway/`)

Presentation layer -- formatters, pages, components.

| Directory            | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `src/formatters/`    | Output formatting (shared, DOM, markdown) |
| `src/pages/`         | Web page modules                          |
| `src/components/`    | Reusable UI components                    |
| `src/commands/`      | CLI command handlers                      |
| `src/slides/`        | Presentation slide modules                |
| `src/lib/`           | Shared utilities                          |
| `src/css/`           | Stylesheets                               |
| `templates/`         | Mustache templates for agent output       |
| `bin/fit-pathway.js` | CLI entry point                           |

---

## Templates

Agent output uses Mustache templates in `products/pathway/templates/`.

### Agent Profile Template (`agent.template.md`)

| Variable           | Source                             |
| ------------------ | ---------------------------------- |
| `{roleTitle}`      | Generated from discipline + track  |
| `{specialization}` | Track name or discipline specialty |
| `{skills}`         | Filtered and sorted skill list     |
| `{behaviours}`     | Working style entries              |
| `{constraints}`    | Stage constraints                  |
| `{handoffs}`       | Stage transition definitions       |

### Skill Document Template (`skill.template.md`)

Variables: `skillName`, `description`, `useWhen`, `stages` (with `focus`,
`activities`, `ready` per stage).

Template substitution is handled by `substituteTemplateVars()` in the agent
module.

---

## Agent Derivation Technical Reference

### Key Functions

| Function                  | Module               | Purpose                           |
| ------------------------- | -------------------- | --------------------------------- |
| `deriveReferenceLevel()`  | agent.js             | Auto-select appropriate level     |
| `deriveAgentSkills()`     | agent.js             | Filter and sort skills for agents |
| `deriveAgentBehaviours()` | agent.js             | Working style generation          |
| `generateSkillMarkdown()` | agent.js             | Generate SKILL.md content         |
| `prepareAgentProfile()`   | profile.js           | Unified agent profile preparation |
| `sortAgentSkills()`       | policies/composed.js | Skill sorting policy              |
| `focusAgentSkills()`      | policies/composed.js | Skill focusing policy             |

### Imports

```javascript
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";
import { deriveReferenceLevel, deriveAgentSkills } from "@forwardimpact/libskill/agent";
```

---

## Scripts

| Script              | Purpose                         |
| ------------------- | ------------------------------- |
| `bun start`         | Build and serve the static site |
| `bun run dev`       | Live development server         |
| `bun run check`     | Format, lint, test, validate    |
| `bun run check:fix` | Auto-fix formatting and linting |
| `bun run test`      | Run unit tests                  |
| `bun run test:e2e`  | Run Playwright E2E tests        |
| `bun run validate`  | Validate data files             |

---

## Related Documentation

- [libskill Internals](/docs/internals/libskill/) -- Derivation engine
- [Map Internals](/docs/internals/map/) -- Data product architecture
- [CLI Reference](/docs/reference/cli/) -- Full CLI command reference

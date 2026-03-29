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
    capability/   Capability formatters
    checklist/    Checklist formatters
    discipline/   Discipline formatters
    driver/       Driver formatters
    level/        Level formatters
    job/          Job definition formatters
    skill/        Skill formatters
    stage/        Stage formatters
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
| Capability | `formatters/capability/` | Capability cards, skill grouping   |
| Checklist  | `formatters/checklist/`  | Read/confirm checklist formatting  |
| Discipline | `formatters/discipline/` | Discipline cards, tier display     |
| Driver     | `formatters/driver/`     | Coverage display, driver cards     |
| Level      | `formatters/level/`      | Level badges, level tables         |
| Job        | `formatters/job/`        | Full job document formatting       |
| Skill      | `formatters/skill/`      | Level badges, matrix tables        |
| Stage      | `formatters/stage/`      | Stage cards, lifecycle flow        |
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

| File                 | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `src/derivation.js`  | Core derivation functions (skills, behaviours, drivers) |
| `src/agent.js`       | Agent team and skill generation                         |
| `src/job.js`         | Job preparation for display                             |
| `src/job-cache.js`   | Job caching for performance                             |
| `src/profile.js`     | Unified profile derivation (human + agent)              |
| `src/modifiers.js`   | Capability and skill modifier resolution                |
| `src/checklist.js`   | Stage transition checklist derivation                   |
| `src/toolkit.js`     | Tool derivation from skill references                   |
| `src/interview.js`   | Interview question selection                            |
| `src/progression.js` | Career path analysis and gap identification             |
| `src/matching.js`    | Job matching and gap analysis                           |
| `src/policies/`      | Filtering, sorting, and threshold policies              |

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

### Agent Profile Template (`agent.md.mustache`)

| Variable           | Source                             |
| ------------------ | ---------------------------------- |
| `{roleTitle}`      | Generated from discipline + track  |
| `{specialization}` | Track name or discipline specialty |
| `{skills}`         | Filtered and sorted skill list     |
| `{behaviours}`     | Working style entries              |
| `{constraints}`    | Stage constraints                  |
| `{handoffs}`       | Stage transition definitions       |

### Skill Document Template (`skill.md.mustache`)

Variables: `skillName`, `description`, `useWhen`, `stages` (with `focus`,
`activities`, `ready` per stage).

Template substitution is handled by `substituteTemplateVars()` in the agent
module.

---

## Agent Derivation Technical Reference

### Key Functions

| Function                   | Module               | Purpose                           |
| -------------------------- | -------------------- | --------------------------------- |
| `deriveReferenceLevel()`   | agent.js             | Auto-select appropriate level     |
| `deriveAgentSkills()`      | agent.js             | Filter and sort skills for agents |
| `deriveAgentBehaviours()`  | agent.js             | Working style generation          |
| `generateSkillMarkdown()`  | agent.js             | Generate SKILL.md content         |
| `prepareAgentProfile()`    | profile.js           | Unified agent profile preparation |
| `filterAgentSkills()`      | policies/composed.js | Skill filtering policy            |
| `sortAgentSkills()`        | policies/composed.js | Skill sorting policy              |
| `focusAgentSkills()`       | policies/composed.js | Skill focusing policy             |

### Imports

```javascript
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";
import { deriveReferenceLevel, deriveAgentSkills } from "@forwardimpact/libskill/agent";
```

---

## NPM Scripts

| Script              | Purpose                         |
| ------------------- | ------------------------------- |
| `npm start`         | Build and serve the static site |
| `npm run dev`       | Live development server         |
| `npm run check`     | Format, lint, test, validate    |
| `npm run check:fix` | Auto-fix formatting and linting |
| `npm run test`      | Run unit tests                  |
| `npm run test:e2e`  | Run Playwright E2E tests        |
| `npm run validate`  | Validate data files             |

---

## Related Documentation

- [libskill Internals](/docs/internals/libskill/) -- Derivation engine
- [Map Internals](/docs/internals/map/) -- Data product architecture
- [CLI Reference](/docs/reference/cli/) -- Full CLI command reference

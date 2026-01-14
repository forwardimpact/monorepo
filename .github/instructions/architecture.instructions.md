---
applyTo: "app/**/*.js"
---

# Architecture

## 3-Layer System

1. **Model** (`app/model/`) - Pure business logic, derivation, validation
2. **Formatter** (`app/formatters/`) - Entity + context → output (DOM/markdown)
3. **View** (`app/pages/`, `app/commands/`, `app/slides/`) - Route handling,
   render calls

## Model Layer Structure

The model layer has a clear hierarchy:

```
model/
  levels.js       # Constants, type helpers (no dependencies)
  modifiers.js    # Skill modifier resolution
  derivation.js   # Core derivation: deriveSkillMatrix, deriveBehaviourProfile, deriveJob
  profile.js      # Unified profile: filtering, sorting, prepareBaseProfile
  job.js          # Job preparation for display (uses derivation via job-cache)
  agent.js        # Agent generation (uses profile.js for filtering/sorting)
  checklist.js    # Checklist derivation
  interview.js    # Interview question selection
  validation.js   # Data validation
```

### Derivation vs Profile

- **derivation.js**: Core derivation logic shared by all consumers
- **profile.js**: Post-processing layer for filtering and sorting

Jobs use `derivation.js` directly (via `job-cache.js`). Agents use `profile.js`
for additional filtering (isHumanOnly, broad skills) and sorting (by level).

## Formatter Layer

**Purpose**: Single place for all presentation logic.

**Structure**:

```
formatters/
  {entity}/
    shared.js    # Helpers shared between DOM/markdown
    dom.js       # Entity → DOM elements
    markdown.js  # Entity → markdown string
```

**Rules**:

- Formatters receive raw entities + context, return rendered output
- Shared helpers handle: relationship resolution, display names, truncation
- Pages/commands NEVER transform data - pass raw entities to formatters

**Pattern**:

```javascript
// Page passes raw entity to formatter
const dom = skillToDOM(skill, { disciplines, tracks, drivers, capabilities });
render(dom);
```

## Key Patterns

### Job Caching

```javascript
import { getOrCreateJob } from "../lib/job-cache.js";
// In pages, cache job before passing to formatter
const job = getOrCreateJob({ discipline, grade, track, skills, behaviours });
const dom = jobToDOM(job, { drivers, discipline, grade, track });
```

### Builder Pages

```javascript
import { createBuilder } from "../components/builder.js";
// Reusable discipline/grade/track selector + preview
createBuilder({ title, previewFormatter, detailPath, renderPreview });
```

### Reactive State (component-local)

```javascript
import { createReactive } from "../lib/reactive.js";
const state = createReactive(initial);
state.subscribe((value) => updateUI(value));
state.set(newValue);
```

### Error Handling

```javascript
import { withErrorBoundary } from "../lib/error-boundary.js";
// Router wraps all pages automatically
// Pages throw NotFoundError/InvalidCombinationError
```

### Output Formatting

```javascript
// Formatters receive raw entities, return rendered output
import { jobToMarkdown } from "../formatters/job/markdown.js";
import { jobToDOM } from "../formatters/job/dom.js";

const dom = jobToDOM(job, { drivers, discipline, grade, track });
const md = jobToMarkdown(job, { drivers, discipline, grade, track });
```

## State Management

Module-level state with subscriber pattern:

```javascript
import { getState, setData, subscribe } from "./lib/state.js";
```

## DOM Rendering

Use render utilities - no innerHTML:

```javascript
import { div, h2, p, render } from "./lib/render.js";
```

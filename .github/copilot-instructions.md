# Engineering Pathway

## Project Overview

Unified framework for human and AI collaboration in engineering. Define roles,
track skills and behaviours, build career paths, and generate AI coding agents
from the same coherent foundation.

**This is a data-driven application.** The model layer defines the schema and
derivation logic, but the actual entities (disciplines, tracks, skills, grades,
behaviours, etc.) are defined entirely in YAML files. Different installations
may have completely different data while using the same model.

**Architecture**: Model → Formatter → View (see `architecture.instructions.md`
for details)

**Data**: YAML files in `examples/` and `data/` contain all human and agent
definitions. Content varies per installation.

**⚠️ Important:** When changing data structure or properties, ALL THREE
locations MUST be updated:

1. `schema/json/` and `schema/rdf/` — Update JSON Schema and RDF/SHACL ontology
2. `examples/` — Update example data files to match new schema
3. `data/` — Update actual data files to match new schema

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, no frameworks

**Patterns**: Job caching, builder component, reactive state, error boundaries

## Instructions

See `.github/instructions/` for details:

- `architecture.instructions.md` - 3-layer system, model structure, job/agent
  derivation, formatter layer, key patterns
- `code-style.instructions.md` - Code style, organization, testing
- `domain-concepts.instructions.md` - Core entities, skill levels, behaviour
  maturities, business domain
- `common-tasks.instructions.md` - Common workflows and CLI usage
- `git-workflow.instructions.md` - Conventional commits
- `vocabulary.instructions.md` - Standard terminology

## Core Rules

1. **Clean breaks** - Fully replace, never leave old and new coexisting
2. **No defensive code** - Trust the architecture, let errors surface
3. **Pure functions** - Model layer has no side effects
4. **Use formatters** - All presentation logic in `formatters/{entity}/`
5. **No transforms in views** - Pages/commands pass raw entities to formatters
6. **Cache jobs** - Use `getOrCreateJob()` in pages before calling formatters
7. **Builder pattern** - Use `createBuilder()` for selector pages
8. **Error boundaries** - Throw typed errors, router handles them
9. **JSDoc types** - All public functions
10. **Test coverage** - New derivation logic requires tests
11. **No frameworks** - Vanilla JS only
12. **ESM modules** - No CommonJS
13. **Conventional commits** - `type(scope): subject`
14. **Co-located files** - All entities (skills, behaviours, disciplines,
    tracks) have `human:` and `agent:` sections in the same file

## ⚠️ Simple vs Easy

**Distinguish easy (hiding complexity) from simple (reducing complexity). Always
prioritize simple.**

- **Easy** = convenient now, complexity hidden (abstractions, wrappers, magic)
- **Simple** = fewer moving parts, less to understand (composition, directness)

✅ **ALWAYS:**

- Reduce total complexity, don't just relocate it
- Prefer explicit over implicit
- Choose direct solutions over clever abstractions
- Fewer layers, fewer indirections

⛔ **NEVER:**

- Add abstraction just to hide complexity
- Create "easy" APIs that obscure what's happening
- Trade long-term simplicity for short-term convenience

## ⚠️ Clean Breaks

**When changing code, fully replace—never leave old and new coexisting.**

✅ **ALWAYS:**

- Replace completely in one change
- Delete old code immediately
- Update all call sites in the same commit
- Remove unused imports, functions, and files

⛔ **NEVER:**

- Keep old code "just in case"
- Add compatibility shims or adapters
- Leave TODO comments for later cleanup
- Comment out old implementations
- Create wrapper functions to support both old and new

**Why:** Coexisting code paths create confusion, increase maintenance burden,
and hide bugs. A clean break is easier to review, test, and understand.

## ⚠️ No Defensive Code

**Trust the architecture. Don't guard against problems that shouldn't happen.**

✅ **ALWAYS:**

- Let errors surface loudly and immediately
- Trust that callers pass valid data
- Rely on TypeScript/JSDoc for type safety
- Use assertions for invariants during development

⛔ **NEVER:**

- Optional chaining unless data is genuinely optional
- Try-catch "just to be safe"
- Null checks for data that should always exist
- Fallback values that mask real problems
- Silently swallow errors or return defaults

**Why:** Defensive code hides bugs instead of fixing them. When something is
wrong, fail fast and fix the root cause. Silent failures are harder to debug
than loud ones.

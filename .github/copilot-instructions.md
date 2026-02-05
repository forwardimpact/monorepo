# Forward Impact

## Vision

Applications that help teams grow and cultivate world-class engineers in the age
of AI.

Engineering excellence requires both human growth and AI augmentation. This
monorepo provides apps that define skills, behaviours, and career paths—working
equally well for human engineers and AI coding agents from the same coherent
model.

## Monorepo Structure

```
apps/
  schema/       @forwardimpact/schema   Schema, validation, data loading
  model/        @forwardimpact/model    Derivation logic, job/agent models
  pathway/      @forwardimpact/pathway  Web app, CLI, formatters
```

| Package                  | CLI           | Purpose                                |
| ------------------------ | ------------- | -------------------------------------- |
| `@forwardimpact/schema`  | `fit-schema`  | Schema definitions and data loading    |
| `@forwardimpact/model`   | —             | Derivation engine for roles and agents |
| `@forwardimpact/pathway` | `fit-pathway` | Web app and CLI for career progression |

**This is a data-driven monorepo.** The model layer defines derivation logic,
but actual entities (disciplines, tracks, skills, grades, behaviours) are
defined entirely in YAML files. Different installations may have completely
different data while using the same model.

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, npm workspaces, no frameworks

## Instructions

See `.github/instructions/` for details:

**General** (apply everywhere):

- `domain-concepts.instructions.md` - Core entities, skill structure, tools
- `vocabulary.instructions.md` - Standard terminology
- `git-workflow.instructions.md` - Conventional commits

**Architecture**:

- `architecture.instructions.md` - Monorepo overview and 3-layer system
- `architecture-schema.instructions.md` - Schema package specifics
- `architecture-model.instructions.md` - Model package specifics
- `architecture-pathway.instructions.md` - Pathway package specifics

**Code Style**:

- `code-style.instructions.md` - General JS code style
- `code-style-pathway.instructions.md` - Pathway-specific patterns
- `css-architecture.instructions.md` - CSS layer architecture

**Tasks**:

- `tasks.instructions.md` - General workflows
- `tasks-schema.instructions.md` - Schema-specific tasks
- `tasks-pathway.instructions.md` - Pathway-specific tasks

## Core Rules

1. **Clean breaks** - Fully replace, never leave old and new coexisting
2. **No defensive code** - Trust the architecture, let errors surface
3. **Pure functions** - Model layer has no side effects
4. **Use formatters** - All presentation logic in `apps/pathway/src/formatters/`
5. **No transforms in views** - Pages/commands pass raw entities to formatters
6. **JSDoc types** - All public functions
7. **Test coverage** - New derivation logic requires tests
8. **No frameworks** - Vanilla JS only
9. **ESM modules** - No CommonJS
10. **Conventional commits** - `type(scope): subject`
11. **Co-located files** - All entities have `human:` and `agent:` sections in
    the same file

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

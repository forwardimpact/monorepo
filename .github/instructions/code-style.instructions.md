---
applyTo: "**/*.js"
---

# Code Style

## JavaScript

- ESM modules only (no CommonJS)
- JSDoc on all public functions (`@param`, `@returns`)
- Pure functions, no side effects
- Descriptive names (`skillLevel`, `behaviourMaturity`)
- Prefix unused params with underscore (`_param`)
- Prefer `const`, use `let` when needed

## File Organization

**Schema** (`apps/schema/src/`): `loader.js`, `validation.js`,
`schema-validation.js`, `index-generator.js`, `levels.js`

**Model** (`apps/model/src/`): `derivation.js`, `modifiers.js`, `profile.js`,
`job.js`, `agent.js`, `checklist.js`, `interview.js`

**Pathway** (`apps/pathway/src/`): `formatters/`, `pages/`, `components/`,
`lib/`, `commands/`, `slides/`

**Formatters** (`apps/pathway/src/formatters/{entity}/`): `shared.js`, `dom.js`,
`markdown.js`

## Naming

- Files: `kebab-case`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- YAML IDs: `snake_case`

## Testing

- Node.js test runner: `node --test`
- Descriptive test names
- Test fixtures mirror YAML structure
- Test success and edge cases

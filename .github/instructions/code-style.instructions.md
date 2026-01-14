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

**Model** (`model/`): `types.js`, `validation.js`, `derivation.js`,
`matching.js`, `interview.js`, `loader.js`, `index.js`

**App** (`app/`): `formatters/`, `pages/`, `components/`, `lib/`, `commands/`,
`slides/`

**Formatters** (`app/formatters/{entity}/`): `shared.js`, `dom.js`,
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

# Part 01 — Layout Checker: Ignore `generated/`

## Problem

`bun run check` fails after `just codegen` because
`scripts/check-package-layout.js` treats `generated/` directories (created by
codegen in `libraries/librpc/` and `libraries/libtype/`) as non-allowed root
subdirectories. These directories are gitignored (`**/generated` in
`.gitignore`) and exist only at runtime.

## Change

**File:** `scripts/check-package-layout.js`

Add `"generated"` to the `IGNORED_SUBDIRS` set (line 23).

**Before:**

```javascript
const IGNORED_SUBDIRS = new Set(["node_modules"]);
```

**After:**

```javascript
const IGNORED_SUBDIRS = new Set(["node_modules", "generated"]);
```

## Rationale

`generated/` is analogous to `node_modules/` — it is gitignored, created by
tooling at runtime, and not part of the package's authored structure. Adding it
to `IGNORED_SUBDIRS` (rather than `ALLOWED_SUBDIRS`) is correct because it
should never be committed or published.

## Blast radius

| Action   | File                              |
| -------- | --------------------------------- |
| Modified | `scripts/check-package-layout.js` |

## Verification

```sh
just codegen
bun run check    # layout check passes with generated/ present
```

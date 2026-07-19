# Plan 2250-a Part 2: Actions axis — relocate the run surface

Move the four agent-run composite actions under the product and repoint their
publish wiring. Depends on Part 1 (the action steps invoke the renamed CLIs).
The sibling repo names and every downstream `uses:` pin are untouched.

## Step 2.1 — Move the four action sources

`git mv` each source dir, then rename the six command families inside the
moved files (Part 1's codemod excluded these dirs).

| From | To |
| --- | --- |
| `.github/actions/bootstrap/` | `products/gemba/actions/bootstrap/` |
| `libraries/libharness/actions/harness/` | `products/gemba/actions/harness/` |
| `libraries/libharness/actions/benchmark/` | `products/gemba/actions/benchmark/` |
| `libraries/libwiki/actions/wiki/` | `products/gemba/actions/wiki/` |

In-file changes with the move:

- `harness/action.yml`: `fit-harness supervise|facilitate|discuss|run`,
  `fit-trace split`, description/comment tokens → gemba names; the
  `clis: fit-harness fit-trace` guidance prose → gemba names.
- `harness/README.md`: the worked example `node
  libraries/libharness/bin/fit-harness.js callback …` → `node
  products/gemba/bin/gemba-harness.js callback …` (a bare token replace would
  yield a path that exists nowhere).
- `benchmark/action.yml` and the reusable workflow nested **inside the action
  source** at `benchmark/.github/workflows/benchmark.yml` (moves with the
  `git mv`): `fit-benchmark run|report`, description tokens → gemba names.
- `wiki/action.yml`: `fit-wiki $COMMAND` and every `fit-wiki` prose token →
  `gemba-wiki`.
- `bootstrap/action.yml`, `bootstrap/README.md`, `bootstrap/apm-verify.mjs`:
  command-token prose only (`clis:` examples → gemba names).
- Internal relative paths, if any action references its old home.

**Verify:** `test ! -d .github/actions/bootstrap -a ! -d
libraries/libharness/actions -a ! -d libraries/libwiki/actions`;
`products/gemba/actions/{bootstrap,harness,wiki,benchmark}/action.yml` exist;
`rg -n '(libharness|libwiki|libxmr)/bin/' products/gemba/actions` returns
nothing.

## Step 2.2 — `fit-install.sh` (moves with bootstrap; edited in place)

**Modified:** `products/gemba/actions/bootstrap/fit-install.sh`.

- `DEFAULT_TOOLS`: `fit-wiki fit-xmr fit-trace` → `gemba-wiki gemba-xmr
  gemba-trace` (`fit-doc`, `fit-terrain`, `coaligned`, and the third-party
  tools stay).
- `is_gear_binary()`: `case "$1" in fit-*|coaligned)` →
  `fit-*|gemba-*|coaligned)`.
- Header/usage prose: "any fit-\* CLI" → "any fit-\*/gemba-\* CLI"; the
  worked examples (`fit-trace fit-wiki`, "the five fit-\* CLIs the kata-\*
  skills invoke") → gemba names.
- **Keep** the filename `fit-install.sh`, `FIT_RELEASE_REPO`,
  `FIT_GEAR_RELEASE` (its default value bumps in Part 4, once the gemba-named
  gear release exists), and the `fit-gear` cask coordinates.

**Verify:** `bash -n products/gemba/actions/bootstrap/fit-install.sh`;
`rg 'fit-(harness|trace|benchmark|selfedit|wiki|xmr)\b'
products/gemba/actions/` returns nothing.

## Step 2.3 — Repoint `publish-actions.yml`

**Modified:** `.github/workflows/publish-actions.yml`.

- Matrix `prefix:` entries: `libraries/libharness/actions/harness` →
  `products/gemba/actions/harness`; same pattern for `benchmark`, `wiki`;
  `.github/actions/bootstrap` → `products/gemba/actions/bootstrap`. All four
  `repo:` names unchanged; the two `products/kata/actions/*` entries
  unchanged.
- `on.push.paths`: the four source globs follow the new prefixes.
- Header comment's action-home description updated.

**Verify:** `yq '.jobs.publish.strategy.matrix.action[].prefix'
.github/workflows/publish-actions.yml` lists the four new paths and the two
kata paths; `repo:` values are byte-identical to before.

## Step 2.4 — Path references to the old action homes

Every config or script that names the moved directories by path repoints to
`products/gemba/actions/`.

| File | Reference |
| --- | --- |
| root `package.json` | `test` script `find` excludes `./libraries/libharness/actions/*` and `./libraries/libwiki/actions/*` → `./products/gemba/actions/*` (the `./products/kata/actions/*` exclude stays) |
| `.github/workflows/publish-binaries.yml` | the gear-release steps sparse-checkout and `sed` `.github/actions/bootstrap/fit-install.sh` by path — both occurrences → `products/gemba/actions/bootstrap/fit-install.sh` (Part 4's release chain depends on this) |
| `.claude/settings.json` | the session hook running `bash .github/actions/bootstrap/fit-install.sh --soft` → new path |
| `justfile` | the recipe invoking `.github/actions/bootstrap/fit-install.sh` → new path |
| `.rumdl.toml`, `biome.json`, `eslint.config.js` | lint/format excludes for the old action dirs → new paths |
| `.coaligned/invariants/temporal.rules.mjs`, `.coaligned/invariants/model-defaults.rules.mjs` | scoped path lists naming the old action dirs → new paths |
| `scripts/test-gate.mjs` | action-dir path excludes → new paths |

**Verify:**
`rg -n --hidden '\.github/actions/bootstrap|libraries/libharness/actions|libraries/libwiki/actions' --glob '!specs/**' --glob '!wiki/**' --glob '!.git/**'`
returns nothing; `bun run test` green (and does not descend into
`products/gemba/actions/`).

## Step 2.5 — Action-home prose

| File | Change |
| --- | --- |
| `.github/CLAUDE.md` | Third-party-actions intro and table: sources for `bootstrap`/`harness`/`benchmark`/`wiki` now live under `products/gemba/actions/`; § Environment bootstrap path → `products/gemba/actions/bootstrap/fit-install.sh`; `IS_SANDBOX` prose command tokens → gemba names. Repo names/URLs in the table unchanged. |
| `CLAUDE.md` § Distribution Model | The composite-actions co-location line drops `libraries/*/actions/`: actions live in `products/*/actions/` and `.github/actions/`. The `sibling-composite-actions` enum block content (repo names) is unchanged; reseed via `bunx coaligned invariants --seed enumeration-drift` only if the check reports drift. |

**Verify:** `bun run check` green (`enumeration-drift`, `context`).

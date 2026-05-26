# Plan — Spec 0750 (terrain refactor CI follow-ups)

## Approach

Sweep every `bunx fit-terrain` invocation in the spec's named surface onto the
verb assignment from `design-a.md`, drop `LOG_LEVEL=error` on `data:prose`,
remove the `kata-release-merge` Step 5 carve-out, add a static gate that fails
CI on any bare `bunx fit-terrain` in the named surface, and update the two
contributor docs that name `synthetic-no-prose`.

## Steps

### S1 — Update `justfile` synthetic recipes

- **Modified:** `justfile`.
- **Change:**

  ```diff
   synthetic:
  -    bunx fit-terrain
  +    bunx fit-terrain build
       bunx fit-map generate-index

   synthetic-update:
  -    bunx fit-terrain --generate
  +    bunx fit-terrain generate
       bunx fit-map generate-index

  -# Generate synthetic data (structural only, no prose)
  -synthetic-no-prose:
  -    bunx fit-terrain --no-prose
  -    bunx fit-map generate-index
  ```

- **Verify:** `just --summary | grep -w synthetic-no-prose` is empty;
  `just --evaluate synthetic` (or inspecting the recipe body) shows
  `bunx fit-terrain build` on the first action line.

### S2 — Update root `package.json` scripts

- **Modified:** `package.json` (`scripts.generate`, `scripts.data:prose`).
- **Change:**
  ```diff
  -    "generate": "fit-terrain",
  +    "generate": "fit-terrain build",
  -    "data:prose": "LOG_LEVEL=error bunx fit-terrain check",
  +    "data:prose": "bunx fit-terrain check",
  ```
- **Out-of-scope siblings (do not edit):** `prestart`, `start`, `dev` are not
  `fit-terrain` callers (they invoke `fit-pathway`/`serve`); `data:schema`
  remains unchanged because design K3 limits the log-level change to
  `data:prose` and `data:schema`'s `bunx fit-terrain validate` invocation is
  already on the verb surface. The plan touches no other `scripts.*` entries.
- **Verify:** `bun run data:prose` prints the cache report at default log level
  with no error-threshold suppression (exit code reflects cache state, not the
  prefix change); `jq -r '.scripts.generate' package.json` prints
  `fit-terrain build`.

### S3 — Update CI workflows

Verified line numbers via
`grep -n 'bunx fit-terrain' .github/workflows/*.{yml,yaml}` (4 hits).
`check-data.yml` is not modified — it has no `bunx fit-terrain` invocation (it
calls `bun run data:prose` / `data:schema`, both fixed in S2).

- **Modified:**
  - `.github/workflows/check-test.yml` (line 18, `test` job, `- run:` form).
  - `.github/workflows/interview-landmark-setup.yml` (line 57, in shell
    heredoc).
  - `.github/workflows/interview-map-setup.yml` (line 55, in shell heredoc).
  - `.github/workflows/interview-summit-setup.yml` (line 57, in shell heredoc).
- **Change (each file, single occurrence):** `bunx fit-terrain` →
  `bunx fit-terrain build`. Example for `check-test.yml:18`:
  ```diff
  -      - run: bunx fit-terrain
  +      - run: bunx fit-terrain build
  ```
  Example for the three `interview-*-setup.yml` files (line numbers above):
  ```diff
  -          bunx fit-terrain
  +          bunx fit-terrain build
  ```
- **Verify:**
  `grep -nE 'bunx fit-terrain($|[^[:alnum:]_-])' .github/workflows/*.yml`
  returns four lines, each with `build` immediately following
  `bunx fit-terrain`.

### S4 — Remove `kata-release-merge` Step 5 carve-out

- **Modified:** `.claude/skills/kata-release-merge/SKILL.md` (the wrapped
  sentence on lines 121–123, ending with `skip to Step 9.`).
- **Change:**
  ```diff
  -After rebase, run `bun run check:fix` then `bun run check`. If checks still fail
  -(excluding expected validation failures from missing `data/pathway/`), mark
  -**blocked** with the failures and skip to Step 9.
  +After rebase, run `bun run check:fix` then `bun run check`. If checks still
  +fail, mark **blocked** with the failures and skip to Step 9.
  ```
- **Verify:**
  `grep -n 'data/pathway' .claude/skills/kata-release-merge/SKILL.md` returns no
  matches.

### S5 — Add static "no bare `bunx fit-terrain`" gate (DROPPED)

> **Status (2026-05-09):** Dropped on PR #727 by @dickolsson — flagged as
> unnecessary defensive code. Scope of PR #727 narrowed to S2 only. The
> unwired `check-terrain-callers` recipe added to `justfile` by PR #686 is
> removed in the same PR so no caller references the deleted script. If a
> regression of this shape recurs, raise a new spec rather than reviving this
> step.

The gate uses two scanning modes so it cannot false-positive on the legitimate
`fit-terrain` _names_ already in `justfile` (`build-binary fit-terrain`,
`dist/binaries/fit-terrain`):

- **Textual mode** (`justfile`, `.github/workflows/**.yml`): the regex
  **requires** a `bunx ` prefix. A bare `fit-terrain` token on those surfaces is
  a name argument or path component, not an invocation, and is ignored.
- **JSON mode** (`package.json`): parse JSON and iterate `scripts.*` values. For
  each shell command (split on `&&` / `;`), strip leading `LOG_LEVEL=…` env
  prefixes and an optional `bunx ` prefix; if the next token is `fit-terrain`,
  the token after it must be one of the accepted verbs.

The CLI itself enforces `inspect <stage>`; the gate accepts a bare `inspect` and
the CLI's usage error surfaces the missing stage on the same CI run.

- **Created:** `scripts/check-terrain-callers.mjs`.
- **Body (full):**

  ```js
  #!/usr/bin/env node
  // Fail if any caller in the spec 0750 named surface (justfile,
  // package.json, .github/workflows/**) invokes fit-terrain without one of
  // the accepted verbs. Two modes: textual (requires `bunx ` prefix) for
  // justfile + workflows; JSON-parsed scripts for package.json.
  import { readFile, readdir } from "node:fs/promises";
  import { resolve, join } from "node:path";

  const root = resolve(new URL("..", import.meta.url).pathname);
  const VERBS = ["check", "validate", "build", "generate", "inspect"];
  const VERB_GROUP = VERBS.join("|");

  // Textual: any `(LOG_LEVEL=… )*bunx fit-terrain` with no verb after it.
  const TEXTUAL = new RegExp(
    String.raw`(?:^|\s)(?:[A-Z_]+=\S+\s+)*bunx\s+fit-terrain\b(?!\s+(?:${VERB_GROUP})\b)`,
  );

  // JSON-mode: tokenize one shell command and verify the verb.
  function scriptHasBareCall(value) {
    return value
      .split(/\s*(?:&&|\|\||;)\s*/)
      .map((cmd) => cmd.replace(/^(?:[A-Z_]+=\S+\s+)*/, ""))
      .map((cmd) => cmd.replace(/^bunx\s+/, ""))
      .filter((cmd) => /^fit-terrain(?:\s|$)/.test(cmd))
      .some((cmd) => {
        const next = cmd.replace(/^fit-terrain\s*/, "").split(/\s+/)[0];
        return !VERBS.includes(next);
      });
  }

  async function listWorkflows() {
    const dir = resolve(root, ".github/workflows");
    const entries = await readdir(dir);
    return entries
      .filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))
      .map((n) => join(dir, n));
  }

  let status = 0;

  // Textual surfaces.
  for (const path of [
    resolve(root, "justfile"),
    ...(await listWorkflows()),
  ]) {
    const text = await readFile(path, "utf8");
    text.split("\n").forEach((line, i) => {
      if (TEXTUAL.test(line)) {
        console.error(
          `${path}:${i + 1}: bare 'bunx fit-terrain' — add a verb (${VERBS.join("|")})`,
        );
        status = 1;
      }
    });
  }

  // package.json scripts.
  const pkg = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  for (const [name, value] of Object.entries(pkg.scripts ?? {})) {
    if (scriptHasBareCall(value)) {
      console.error(
        `package.json:scripts.${name}: bare fit-terrain — add a verb (${VERBS.join("|")})`,
      );
      status = 1;
    }
  }

  process.exit(status);
  ```

- **Modified:** `package.json` (`scripts.context` chain only — no new `justfile`
  recipe; the npm `context:terrain` script is the canonical entry, and
  `bun run check` runs it via `context`).
- **`package.json` wiring:**
  ```diff
  -    "context": "bun run context:instructions && bun run context:metadata && bun run context:catalog",
  +    "context": "bun run context:instructions && bun run context:metadata && bun run context:catalog && bun run context:terrain",
  +    "context:terrain": "bun scripts/check-terrain-callers.mjs",
  ```
- **Verify (non-destructive):**
  1. `bun run context:terrain` exits 0 from a clean working tree post-S1–S3 (the
     textual regex requires `bunx `, so `justfile`'s `build-binary fit-terrain`
     and `dist/binaries/fit-terrain` lines do not trip it; the JSON scan sees
     `fit-terrain build` for `scripts.generate` and is silent).
  2. Confirm the red-path against a stdin fixture, no working-tree edits:
     ```sh
     printf '%s\n' '    bunx fit-terrain' \
       | bun -e "
         const re = /(?:^|\s)(?:[A-Z_]+=\S+\s+)*bunx\s+fit-terrain\b(?!\s+(?:check|validate|build|generate|inspect)\b)/;
         let s = ''; for await (const c of Bun.stdin.stream()) s += new TextDecoder().decode(c);
         process.exit(re.test(s) ? 0 : 1);
       "
     # exit 0 → the pattern correctly flags the bare form
     ```
  3. `bun run check` passes end-to-end after the wiring lands.

### S6 — Update contributor docs

- **Modified:**
  - `websites/fit/docs/getting-started/contributors/index.md` — in the "Other
    generation modes" sh code block (line 48), delete the line
    `just synthetic-no-prose   # Structural data only, no prose content`. The
    surrounding `just synthetic` and `just synthetic-update` bullets remain.
  - `websites/fit/docs/internals/operations/index.md` — in the "Generation" sh
    code block (line 104), delete the `just synthetic-no-prose …` line. In the
    prose paragraph immediately after (lines 107–109), drop the trailing
    sentence that begins "The `no-prose` mode produces…", leaving the
    `synthetic-update` sentence as the paragraph's final line.
- **Verify:** `grep -rn 'synthetic-no-prose' websites/ .claude/ CONTRIBUTING.md`
  returns no hits.

### S7 — Verify CI green on the impl PR and on `main` post-merge

- **Action:** push S1–S6 on the implementation branch; await `Test` and `Data`
  workflows; merge; confirm post-merge `main` runs are green.
- **Verify:**
  - Pre-merge: `gh pr checks <impl-pr>` — `e2e` and `prose` both `pass`.
  - Post-merge: `gh run list --workflow=Test --branch main --limit 1` and
    `gh run list --workflow=Data --branch main --limit 1` — `e2e` and `prose`
    each report `success`.

### S8 — Clean-checkout replay (success criterion 6)

- **Action:** in a fresh clone, run `bun install`, then `just quickstart`, then
  `bun start`.
- **Verify:** `quickstart` completes without error; `bun start` clears
  `prestart` (no `ENOENT` on `data/pathway/`); `serve` binds and the home page
  responds 200.

## Libraries used

Libraries used: none.

## Risks

| Id  | Risk                                                                                                                                                                  | Why not visible from the plan                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | The `Test (e2e)` `synthetic-cache` is hit on the impl branch (key includes `data/synthetic/**` only), masking the miss-path fix.                                      | The cache is keyed on `hashFiles('data/synthetic/**', 'products/map/schema/json/**', 'bun.lock')`, not on branch — to force a miss, the implementer must touch any file under `data/synthetic/**` (a no-op edit suffices) before pushing.                                                                                                     |
| P2  | `data:prose` keeps exit-code 1 after the S2 prefix change because the cache invariant currently failing on `main` is unrelated to `LOG_LEVEL`.                        | Spec scope excludes `data/synthetic/` content. If exit-code 1 persists in CI after S2 lands the diagnostic visibly, the residual fix is outside this PR; the implementer reports the surfaced error to the spec author rather than chasing it in S2.                                                                                          |
| P3  | The S5 gate's textual mode requires a `bunx ` prefix, so a future `fit-terrain VERB` invocation in a workflow `run:` block (without `bunx`) would slip past the gate. | Today no workflow invokes `fit-terrain` without `bunx`, but a future contributor following the npm-script pattern in a workflow could; if that shape appears, extend the textual regex to also match a leading `fit-terrain` token on a recipe/run-block line. The risk is named here so the implementer can monitor for it during S3 review. |

## Execution

Sequential agent: **`staff-engineer`**. Single PR with S1–S6 as one squashed
commit (or six commits squashed at merge — implementer's choice), with S7 (CI
green on the impl PR, then on `main` post-merge) as the merge gate and S8
(clean-checkout replay) performed once before applying `plan:implemented`.

Inter-step dependencies:

- **S1, S2, S3 → S5**: the gate (S5) requires the named-surface invocations to
  carry verbs before its `bun run context:terrain` call exits 0. In a single
  squashed commit this is satisfied automatically; if the implementer chooses
  multiple commits, S5's wiring must land in the same commit as (or after) the
  S1/S2/S3 edits so `bun run check` is not red mid-PR.
- **S5 → S7**: the gate runs as part of `bun run check` in CI; expected green on
  the impl PR.
- **S1 ⇒ S8**: clean-checkout replay depends on the fixed `synthetic` recipe.

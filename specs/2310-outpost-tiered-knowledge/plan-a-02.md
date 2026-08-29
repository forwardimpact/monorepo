# Plan 2310-a Part 02: CLI Surface and KB Lifecycle

Wire the part-01 module into `validate`, and move `init`/`update` to the
tier layout. Depends on part 01.

## Step 1: Extend the CLI definition

`validate` takes an optional KB-root path, and `--json` covers findings.

- Modified: `products/outpost/src/outpost.js` (`buildDefinition`, usage
  header comment)

In `commands`: `{ name: "validate", args: "[path]", description:
"Validate agent definitions and knowledge bases" }`. In `globalOptions`,
the `json` description becomes `"JSON output (with --help and validate)"`.
Update the usage comment block at the top of the file to match.

Verification: `fit-outpost --help` shows the new argument and description.

## Step 2: Route `validate` through the module

- Modified: `products/outpost/src/outpost.js` (`validate` handler)

```js
async function validate() {
  if (args[0]) return runKnowledgeChecks([expandPath(args[0])]);
  const config = await loadConfig();
  // existing agent-definition loop, unchanged …
  const kbRoots = [...new Set(agents.map(([, a]) => a.kb).filter(Boolean))]
    .map(expandPath);
  return Math.max(errors ? 1 : 0, await runKnowledgeChecks(kbRoots));
}
```

(`errors` is the existing agent-definition counter; keep its name.)
`runKnowledgeChecks(roots)` calls `validateKnowledgeBase` per root. Without
`--json`: one line per finding (`file:line kind link-or-path`, `warn:`
prefix when baselined) through the logger. With `--json`: one merged JSON
array of finding objects is the only stdout; the agent-definition lines
route to stderr so the array stays parseable. Exit 1 when any finding has
`baselined: false`, else 0. With no configured agents and no path, keep
the current "No agents configured" exit-0 path.

Verification: new cases in `products/outpost/test/outpost-cli.test.js`
cover the path form, the `--json` shape, and the exit codes, with a temp
vault fixture.

## Step 3: Regenerate the golden fixtures and wire a runner

The definition change is deliberate; the byte-stability contract moves to
the new bytes. Today nothing executes `test/golden/fit-outpost/` and
`help.stdout` is stale at version 3.3.4, so the `buildDefinition` comment
claims a contract no test enforces.

- Created: `products/outpost/test/golden.test.js`
- Modified: `products/outpost/test/golden/fit-outpost/help.stdout`
- Modified: `products/outpost/test/golden/fit-outpost/cases.json`

Pin `OUTPOST_VERSION: 0.0.0-golden` in the `help` case's env (the
`version` case already does this) so the fixture stops embedding the live
version. Re-capture with root `bun run capture-cli-golden`
(`scripts/capture-cli-golden.mjs`, which also has `--verify`). Add a
golden runner test modeled on `products/gemba/test/golden.test.js` so the
fixtures execute in the gate from now on.

Verification: root `bun run test` runs the new golden test and it passes;
reverting the definition change makes it fail.

## Step 4: init creates tiers and the registry

- Modified: `products/outpost/src/kb-manager.js` (`init`)

Replace the `["Knowledge", "Drafts", "Briefings"]` loop with
`["0-Draft", "1-Management", "2-Confidential", "3-Team", "4-Public",
"Briefings"]`. After `copyBundledFiles`, copy `registry.yaml` from the
template dir when the destination has none. Update the comment: tiers are
the graph; entity subdirectories stay on-demand; the registry is a
personal surface humans edit.

Verification: kb-manager test asserts the six directories, `registry.yaml`,
the bundled files, and nothing else (no MIGRATION.md) exist after init
(criteria 1 and 17, install half).

## Step 5: update installs MIGRATION.md on legacy layouts

- Modified: `products/outpost/src/kb-manager.js` (`update`)

After `copyBundledFiles`: install `registry.yaml` when absent (never
overwrite; humans edit it). When `Knowledge/` or `Drafts/` exists at the
destination, copy `templates/MIGRATION.md` to the KB root and log a
pointer to it; when neither exists, do not install it and remove nothing.
`copyBundledFiles` itself must not pick up `MIGRATION.md` or
`registry.yaml` (it copies named files only; assert this stays true).

Verification: kb-manager tests: update on a legacy fixture lands
MIGRATION.md (criterion 10, install half); update on a conforming fixture
does not; an edited `registry.yaml` survives update.

Libraries used: libcli (definition), libmock (kb-manager tests), part-01
module.

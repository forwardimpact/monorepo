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
  return Math.max(agentErrors ? 1 : 0, await runKnowledgeChecks(kbRoots));
}
```

`runKnowledgeChecks(roots)` calls `validateKnowledgeBase` per root. Without
`--json`: one line per finding (`file:line kind link-or-path`, `warn:`
prefix when baselined) through the logger. With `--json`: one merged JSON
array of finding objects on stdout, no log lines. Exit 1 when any finding
has `baselined: false`, else 0. With no configured agents and no path, keep
the current "No agents configured" exit-0 path.

Verification: new cases in `products/outpost/test/outpost-cli.test.js`
cover the path form, the `--json` shape, and the exit codes, with a temp
vault fixture.

## Step 3: Regenerate the golden fixtures

The definition change is deliberate; the byte-stability contract moves to
the new bytes.

- Modified: `products/outpost/test/golden/fit-outpost/help.stdout`

Re-capture `--help` output with the same renderer the golden test uses and
overwrite the fixture. The other fixtures (`version`, `no-args`,
`unknown`) do not change.

Verification: `bun run test` golden cases pass.

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
(criterion 1).

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

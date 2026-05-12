# Plan 920-a — Pathway organizational context slot for agent generation

Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

## Approach

The slot lands in eight ordered steps along the data-flow seam the design names:
schema first so `bunx fit-map validate` accepts the file the moment it ships,
then loaders (Node `loadAgentData` and browser `loadAgentDataBrowser`), then
the pure renderer in `libskill`, then the composer signature extension and its
three call sites (CLI `agent-io.js`, web `agent-builder.js`+
`agent-builder-preview.js`, distribution `build-packs.js`), then the starter
example, then the pre-change baseline fixture capture, then guide and skill/CLI
documentation. The slot is canonical at the data-directory root; the loader's
existing `repository/` fallback handles legacy installs transparently. Tests
land alongside each step so the implementation walks behind a green bar at
every commit.

The design's loader divergence (return `null` when the slot is absent rather
than the `{}` that `claudeSettings`/`vscodeSettings` use) is deliberate — the
renderer's nullish entry check distinguishes "no slot" from "loader couldn't
parse." Implementer keeps the divergence.

Libraries used: none new. (Existing internals: `Ajv` + `ajv-formats` already
wired in `schema-validation.js`; `Mustache` already used by
`formatTeamInstructions`; `yaml` already used by both loaders.)

## File map

| File | Change | Step |
| --- | --- | --- |
| `products/map/schema/json/organizational-context.schema.json` | **Create** | 1 |
| `products/map/src/schema-validation.js` § `SCHEMA_MAPPINGS` + `#OPTIONAL_SILENT` | Modify | 1 |
| `products/map/test/validation-organizational-context.test.js` | **Create** | 1 |
| `products/map/src/loader.js` § `loadAgentData` | Modify (Node loader) | 2 |
| `products/map/test/data-loader.test.js` | Append `loadAgentData` cases for the new slot | 2 |
| `products/pathway/src/lib/yaml-loader.js` § `loadAgentDataBrowser` | Modify (browser loader) | 2 |
| `libraries/libskill/src/agent.js` | Add exported `renderOrganizationalContext` | 3 |
| `libraries/libskill/src/index.js` | Re-export `renderOrganizationalContext` | 3 |
| `tests/model-agent.test.js` | Add `renderOrganizationalContext` cases | 3 |
| `products/pathway/src/formatters/agent/team-instructions.js` § `formatTeamInstructions` | Extend signature: `(teamInstructions, orgSection, template)` | 4 |
| `products/pathway/src/commands/agent.js` § `printTeamInstructions` + `handleAgent` | Thread `orgSection` through CLI | 4 |
| `products/pathway/src/commands/agent-io.js` § `writeTeamInstructions` | Gate write on either input; thread `orgSection` | 4 |
| `products/pathway/src/pages/agent-builder.js` § `buildDeriveContext` | Thread `agentData.organizationalContext` into derive context | 4 |
| `products/pathway/src/pages/agent-builder-preview.js` § `deriveAgentData` | Render `orgSection` and pass through composer | 4 |
| `products/pathway/src/commands/build-packs.js` § `derivePackContent` + `formatContent` | Thread `orgSection` so published packs match local CLI | 4 |
| `products/pathway/test/cli-command.test.js` (or new `agent-command.test.js`) | Add CLI integration cases for slot present/absent/partial/empty | 4 |
| `products/map/starter/organizational-context.yaml` | **Create** | 5 |
| `products/pathway/test/fixtures/claude-md-baseline-se-platform.md` | **Create** (pre-change baseline) | 6 |
| `products/pathway/test/agent-baseline.test.js` | **Create** (byte-identical-absent + populated-starter tests) | 6 |
| `websites/fit/docs/products/agent-teams/organizational-context/index.md` | Modify (introduce slot + marker + last-occurrence rule) | 7 |
| `websites/fit/docs/products/authoring-standards/index.md` | Modify (new entity step) | 7 |
| `.claude/skills/fit-pathway/SKILL.md` § `## Documentation` | Modify (no change to URLs; verify ordering matches CLI) | 8 |
| `products/pathway/bin/fit-pathway.js` § `documentation` | Modify (no URL change; verify ordering matches skill) | 8 |

No file deletions. The existing org-context guide URL already appears in both
the skill list and CLI `documentation` array; Step 8 confirms they stay in
lockstep after the guide content changes in Step 7.

## Sequencing

Steps 1 → 8 are sequential at the seam level: each step's verification
(`bun run test`-runnable) depends on the previous step's surface existing. But
two clusters can run in parallel inside a step:

- Step 2: Node loader and browser loader are independent edits.
- Step 4: the three call sites (CLI / web / build-packs) are independent once
  the composer signature lands.

Routing recommendation in § Execution.

## Step 1 — Schema + validator wiring

Create the Ajv schema and register it in `SCHEMA_MAPPINGS` so
`bunx fit-map validate` accepts the slot when present and stays silent when
absent.

**Created:** `products/map/schema/json/organizational-context.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://www.forwardimpact.team/schema/json/organizational-context.schema.json",
  "title": "Organizational Context",
  "description": "Installation-scoped per-team context surfaced into the rendered .claude/CLAUDE.md by fit-pathway agent.",
  "type": "object",
  "properties": {
    "repositories": {
      "type": "array",
      "description": "Repository names this team works in",
      "items": { "type": "string" }
    },
    "team": {
      "type": "string",
      "description": "Team handle"
    },
    "manager": {
      "type": "string",
      "description": "Manager handle"
    },
    "adjacentLeads": {
      "type": "array",
      "description": "Leads on neighboring teams, each with a free-form role tag",
      "items": {
        "type": "object",
        "required": ["handle", "role"],
        "properties": {
          "handle": { "type": "string" },
          "role": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "projects": {
      "type": "array",
      "description": "Active project names",
      "items": { "type": "string" }
    },
    "escalationPaths": {
      "type": "array",
      "description": "When to escalate and where",
      "items": {
        "type": "object",
        "required": ["trigger", "destination"],
        "properties": {
          "trigger": { "type": "string" },
          "destination": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

**Modified:** `products/map/src/schema-validation.js`. Add the file to
`SCHEMA_MAPPINGS` and to `#OPTIONAL_SILENT` (so `MISSING_FILE` is suppressed
when absent):

```diff
 const SCHEMA_MAPPINGS = {
   "drivers.yaml": "drivers.schema.json",
   "levels.yaml": "levels.schema.json",
   "standard.yaml": "standard.schema.json",
   "self-assessments.yaml": "self-assessments.schema.json",
+  "organizational-context.yaml": "organizational-context.schema.json",
   capabilities: "capability.schema.json",
   ...
 };
 ...
-  static #OPTIONAL_SILENT = ["self-assessments.yaml"];
+  static #OPTIONAL_SILENT = [
+    "self-assessments.yaml",
+    "organizational-context.yaml",
+  ];
```

**Created:** `products/map/test/validation-organizational-context.test.js`. Four
cases against a temp data-dir (using the existing `mkdtemp` + injected-fs
pattern from `data-loader.test.js`):

1. clean populated slot (all six concerns, two `adjacentLeads`, two
   `escalationPaths`) → `valid: true`, no errors, no `MISSING_FILE` warning.
2. absent slot → `valid: true`, no errors, no warning (silent-optional path).
3. malformed slot: missing `destination` inside an `escalationPaths` entry,
   one unknown top-level key (`oncallRotation`), one type mismatch
   (`repositories: "molecularforge"` — string instead of array) → three
   errors, each carrying a non-empty `path` substring (`organizational-context.yaml`).
4. all-empty slot (`{}`) → `valid: true` (top-level concerns are optional).

**Verify:**

- `bun run test products/map/test/validation-organizational-context.test.js`
  exits 0.
- `cd /tmp && rm -rf orgctx-validate-fixture && mkdir orgctx-validate-fixture && cd orgctx-validate-fixture && cp -r $REPO/products/map/starter/* . && bunx fit-map validate --data=.` exits 0
  before Step 5 lands the starter file (proves silent-optional behaviour);
  same command **after** Step 5 lands also exits 0 with no warnings cited
  for the new file (proves the populated starter validates clean).
- `rg -n 'organizational-context' products/map/src/schema-validation.js`
  returns hits at both the `SCHEMA_MAPPINGS` and `#OPTIONAL_SILENT` lines.

## Step 2 — Loader extensions (Node + browser)

The Node loader feeds the CLI and `build-packs`; the browser loader feeds the
web preview. Both surface `agentData.organizationalContext`.

**Modified:** `products/map/src/loader.js` § `loadAgentData`. Add a fifth
`Promise.all` entry using the existing `#loadRepoFile` helper with `null`
fallback (deliberate divergence from sibling `{}` fallbacks — see Approach):

```diff
   async loadAgentData(dataDir) {
     ...
     const [
       disciplineFiles,
       trackFiles,
       behaviourFiles,
       claudeSettings,
       vscodeSettings,
+      organizationalContext,
     ] = await Promise.all([
       this.#loadDisciplinesFromDir(disciplinesDir),
       this.#loadTracksFromDir(tracksDir),
       this.#loadBehavioursFromDir(behavioursDir),
       this.#loadRepoFile(dataDir, "claude-settings.yaml", {}),
       this.#loadRepoFile(dataDir, "vscode-settings.yaml", {}),
+      this.#loadRepoFile(dataDir, "organizational-context.yaml", null),
     ]);
     ...
     return {
       disciplines,
       tracks,
       behaviours,
       claudeSettings,
       vscodeSettings,
+      organizationalContext,
     };
   }
```

**Modified:** `products/pathway/src/lib/yaml-loader.js` §
`loadAgentDataBrowser`. Mirror the Node change with the same `repository/`-
then-root fallback the file already uses for the other two settings:

```diff
 export async function loadAgentDataBrowser(dataDir = "./data") {
-  const [disciplines, tracks, behaviours, claudeSettings, vscodeSettings] =
+  const [
+    disciplines,
+    tracks,
+    behaviours,
+    claudeSettings,
+    vscodeSettings,
+    organizationalContext,
+  ] =
     await Promise.all([
       loadDisciplinesFromDir(`${dataDir}/disciplines`),
       loadTracksFromDir(`${dataDir}/tracks`),
       loadBehavioursFromDir(`${dataDir}/behaviours`),
       tryLoadYamlFile(`${dataDir}/repository/claude-settings.yaml`).then(
         (r) => r ?? tryLoadYamlFile(`${dataDir}/claude-settings.yaml`),
       ),
       tryLoadYamlFile(`${dataDir}/repository/vscode-settings.yaml`).then(
         (r) => r ?? tryLoadYamlFile(`${dataDir}/vscode-settings.yaml`),
       ),
+      tryLoadYamlFile(
+        `${dataDir}/repository/organizational-context.yaml`,
+      ).then(
+        (r) =>
+          r ?? tryLoadYamlFile(`${dataDir}/organizational-context.yaml`),
+      ),
     ]);

   return {
     ...
     claudeSettings: claudeSettings || {},
     vscodeSettings: vscodeSettings || {},
+    organizationalContext: organizationalContext ?? null,
   };
 }
```

Note: `tryLoadYamlFile` returns `null` on miss; the `??` keeps `null` rather
than coercing to `{}` — same nullish-vs-empty distinction the Node loader
makes.

**Modified:** `products/map/test/data-loader.test.js`. Append three
`loadAgentData` cases mocking `fs.stat` + `fs.readFile`:

1. neither root file nor `repository/` file present → returned object has
   `organizationalContext: null`.
2. root file present (`<dataDir>/organizational-context.yaml`) → returned
   object's `organizationalContext` is the parsed YAML.
3. `repository/` precedence: both files present →
   `<dataDir>/repository/organizational-context.yaml` wins (same precedence
   the helper applies to its peers).

**Verify:**

- `bun run test products/map/test/data-loader.test.js` exits 0.
- The browser-loader change is exercised at Step 4's CLI integration tests
  (the web preview cannot be black-box tested in `bun test` headlessly, but
  the deriveAgentData unit at Step 4 covers the same `organizationalContext`
  → `orgSection` path).

## Step 3 — `renderOrganizationalContext` in libskill

Add a pure function that takes the loaded YAML object (or `null`) and returns
the markdown section string — or `null` when the slot is absent or has no
non-empty concerns.

**Modified:** `libraries/libskill/src/agent.js`. Insert directly after
`interpolateTeamInstructions`. Implementation contract (deferred to the
implementer, but section emission rules are pinned):

- Input `null` / `undefined` / `{}` → return `null`.
- A non-empty value for at least one of the six concerns triggers section
  emission; otherwise return `null`.
- Within the section:
  - `repositories` empty / absent → suppress that bullet.
  - `team` empty / absent → suppress that bullet.
  - `manager` empty / absent → suppress that bullet.
  - `adjacentLeads` empty / absent → suppress that bullet; non-empty →
    `"- **Adjacent leads:** " + entries.map(e => "${e.handle} (${e.role})").join(", ")`.
  - `projects` empty / absent → suppress that bullet.
  - `escalationPaths` empty / absent → suppress the parent bullet;
    non-empty → emit `"- **Escalation paths:**"` parent bullet followed by
    one indented sub-bullet per entry shaped `"  - ${trigger} → ${destination}"`.
- Section opens with the literal line `## Organizational Context` followed
  by a blank line, then the bullet list (each bullet ends with `\n`).
- No trailing whitespace after the last line of the section.

Reference output (matches design § Rendered Section verbatim for the populated
starter — re-paste it here so the implementer has the exact bytes the
populated-starter test will assert):

```markdown
## Organizational Context

- **Repositories:** molecularforge, data-lake-infra, api-gateway
- **Team:** pharma-platform
- **Manager:** athena
- **Adjacent leads:** iris (DX), prometheus (DS/AI)
- **Projects:** drug-discovery-pipeline, lab-data-portal
- **Escalation paths:**
  - production page after hours → pagerduty://pharma-platform-oncall
  - security incident → security@pharma.example.com
```

Export the new function:

```diff
 export function interpolateTeamInstructions({ agentTrack, humanDiscipline }) {
   ...
 }
+
+export function renderOrganizationalContext(orgContext) {
+  // ... per contract above
+}
```

**Modified:** `libraries/libskill/src/index.js`. Re-export:

```diff
 export {
   ...
   interpolateTeamInstructions,
+  renderOrganizationalContext,
 } from "./agent.js";
```

**Modified:** `tests/model-agent.test.js`. Add a `describe("renderOrganizationalContext")`
block with at minimum these cases:

1. `null` input → `null`.
2. `undefined` input → `null`.
3. `{}` input → `null`.
4. all-concerns-empty-string slot (`{ repositories: [], team: "", manager: "", adjacentLeads: [], projects: [], escalationPaths: [] }`) → `null`.
5. only `manager` populated → section with one bullet, no `escalationPaths`
   parent bullet, opens with `## Organizational Context`.
6. fully-populated slot (the design fixture) → equals the reference output
   byte-for-byte.
7. `adjacentLeads` with one entry → no trailing comma after the role tag.
8. `escalationPaths` with one entry → emits parent bullet + one indented
   sub-bullet; no empty trailing bullet.
9. `repositories` of length 1 → no commas in the rendered string for that
   bullet.

**Verify:**

- `bun run test tests/model-agent.test.js` exits 0.
- `rg -n 'renderOrganizationalContext' libraries/libskill/src/index.js`
  returns one hit (export line).

## Step 4 — Composer signature extension + three call sites

The composer is the single seam where `teamInstructions` and the rendered
org-section concatenate. Extend its signature so every surface produces
byte-identical CLAUDE.md slices, then update the three callers in parallel.

**Modified:** `products/pathway/src/formatters/agent/team-instructions.js`.
Replace the function body with:

```js
import Mustache from "mustache";

import { trimValue } from "../shared.js";

/**
 * Format team instructions + organizational context as CLAUDE.md file content.
 *
 * Returns `null` when both inputs are null/empty (the caller suppresses the
 * file write in that case — preserving today's absent-slot behaviour).
 *
 * Section ordering: teamInstructions body first, then a single blank line,
 * then the organizational context section. The org section is appended last
 * so downstream tooling that string-matches `## Organizational Context` can
 * use the last occurrence to survive prose collisions inside teamInstructions.
 *
 * @param {string|null} teamInstructions - Already-interpolated team instructions content
 * @param {string|null} orgSection - Already-rendered organizational context section
 * @param {string} template - Mustache template string
 * @returns {string|null} Rendered CLAUDE.md content, or null when both inputs are empty
 */
export function formatTeamInstructions(teamInstructions, orgSection, template) {
  const ti = trimValue(teamInstructions);
  const os = trimValue(orgSection);
  if (!ti && !os) return null;
  const content = ti && os ? `${ti}\n\n${os}` : (ti || os);
  return Mustache.render(template, { content });
}
```

The two-input contract: either input may be `null` / empty / whitespace-only;
output is `null` only when both are. When both are present, the org-section
follows the team instructions body separated by exactly one blank line
(`\n\n`). The order is fixed — org-section is always last so the marker
contract's last-occurrence rule holds.

**Modified:** `products/pathway/src/commands/agent.js`. Two edits in this
file:

(a) `printTeamInstructions` (console output path) — thread `orgSection`:

```diff
-function printTeamInstructions(agentTrack, humanDiscipline, template) {
+function printTeamInstructions(agentTrack, humanDiscipline, orgSection, template) {
   const teamInstructions = interpolateTeamInstructions({
     agentTrack,
     humanDiscipline,
   });
-  if (teamInstructions) {
-    // Markdown output — headings stay literal so downstream tools parse them
+  const content = formatTeamInstructions(teamInstructions, orgSection, template);
+  if (content) {
     process.stdout.write("# Team Instructions (CLAUDE.md)\n\n");
-    process.stdout.write(
-      formatTeamInstructions(teamInstructions, template) + "\n",
-    );
+    process.stdout.write(content + "\n");
     process.stdout.write("\n---\n\n");
   }
 }
```

(b) `handleAgent` — render the org-section once and pass it through both the
console and file paths:

```diff
 import {
   ...
   interpolateTeamInstructions,
+  renderOrganizationalContext,
 } from "@forwardimpact/libskill/agent";
 ...
   if (!options.output) {
-    printTeamInstructions(agentTrack, humanDiscipline, claudeTemplate);
+    const orgSection = renderOrganizationalContext(agentData.organizationalContext);
+    printTeamInstructions(agentTrack, humanDiscipline, orgSection, claudeTemplate);
     process.stdout.write(formatAgentProfile(profile, agentTemplate) + "\n");
     return;
   }

   const teamInstructions = interpolateTeamInstructions({
     agentTrack,
     humanDiscipline,
   });
-  await writeTeamInstructions(teamInstructions, baseDir, claudeTemplate);
+  const orgSection = renderOrganizationalContext(agentData.organizationalContext);
+  await writeTeamInstructions(teamInstructions, orgSection, baseDir, claudeTemplate);
```

**Modified:** `products/pathway/src/commands/agent-io.js`. Update the
`writeTeamInstructions` signature and gate:

```diff
 export async function writeTeamInstructions(
   teamInstructions,
+  orgSection,
   baseDir,
   template,
 ) {
-  if (!teamInstructions) return null;
+  const content = formatTeamInstructions(teamInstructions, orgSection, template);
+  if (!content) return null;
   const filePath = join(baseDir, ".claude", "CLAUDE.md");
-  const content = formatTeamInstructions(teamInstructions, template);
   await ensureDir(filePath);
   await writeFile(filePath, content, "utf-8");
   logger.info(formatSuccess(`Created: ${filePath}`));
   return filePath;
 }
```

The skip-on-null gate moves from "skip when `teamInstructions` is falsy" to
"skip when the composer returns `null`" — so the slot-only case (no
teamInstructions, but populated org-context) writes the file as the spec
requires.

**Modified:** `products/pathway/src/pages/agent-builder-preview.js`. Thread
`orgSection` through `deriveAgentData`:

```diff
 import {
   generateAgentProfile,
   generateSkillMarkdown,
   deriveAgentSkills,
   interpolateTeamInstructions,
+  renderOrganizationalContext,
 } from "@forwardimpact/libskill/agent";
 ...
 export function deriveAgentData(context) {
   const {
     ...
     templates,
+    organizationalContext,
   } = context;
   ...
   const teamInstructions = interpolateTeamInstructions({
     agentTrack,
     humanDiscipline,
   });
-  const teamInstructionsContent = teamInstructions
-    ? formatTeamInstructions(teamInstructions, templates.claude)
-    : null;
+  const orgSection = renderOrganizationalContext(organizationalContext);
+  const teamInstructionsContent = formatTeamInstructions(
+    teamInstructions,
+    orgSection,
+    templates.claude,
+  );

   return { profile, skillFiles, toolkit, teamInstructionsContent };
 }
```

**Modified:** `products/pathway/src/pages/agent-builder.js`. Thread
`organizationalContext` into `buildDeriveContext` (the function already
threads `claudeSettings` and `vscodeSettings` the same way):

```diff
   function buildDeriveContext(combo, level) {
     return {
       ...combo,
       level,
       skills: data.skills,
       capabilities: data.capabilities,
       behaviours: data.behaviours,
       agentBehaviours: agentData.behaviours,
       claudeSettings: agentData.claudeSettings,
       vscodeSettings: agentData.vscodeSettings,
+      organizationalContext: agentData.organizationalContext,
       templates,
     };
   }
```

**Modified:** `products/pathway/src/commands/build-packs.js`. Two edits to
keep published distribution packs in lockstep with the local CLI:

(a) `derivePackContent` — render and return `orgSection`:

```diff
 import {
   ...
   interpolateTeamInstructions,
+  renderOrganizationalContext,
 } from "@forwardimpact/libskill/agent";
 ...
   const teamInstructions = interpolateTeamInstructions({
     agentTrack: track,
     humanDiscipline,
   });
+  const orgSection = renderOrganizationalContext(agentData.organizationalContext);

-  return { profiles, skillFiles, teamInstructions };
+  return { profiles, skillFiles, teamInstructions, orgSection };
 }
```

(b) `formatContent` — pass `orgSection` through the composer:

```diff
 function formatContent(
-  { profiles, skillFiles, teamInstructions },
+  { profiles, skillFiles, teamInstructions, orgSection },
   templates,
   settings,
 ) {
   return {
     ...
-    teamInstructions: teamInstructions
-      ? formatTeamInstructions(teamInstructions, templates.claude)
-      : null,
+    teamInstructions: formatTeamInstructions(
+      teamInstructions,
+      orgSection,
+      templates.claude,
+    ),
     ...
   };
 }
```

The destructuring update at the call site (`generatePacks`) flows the new
field through unchanged — `derivePackContent` already returns a fresh object
each call.

**Modified:** `products/pathway/test/cli-command.test.js` (or new
`agent-command.test.js` if cli-command.test.js is already overcrowded — implementer's
discretion). Add CLI integration cases:

1. **populated slot, no teamInstructions** — temp data-dir, track has no
   `agent.teamInstructions`, slot present; run
   `runAgentCommand({ ..., options: { output: tmpdir, track: "platform" } })`;
   assert `.claude/CLAUDE.md` exists and contains
   `## Organizational Context` and the manager handle.
2. **populated slot, populated teamInstructions** — both present; assert
   `.claude/CLAUDE.md` contains the teamInstructions body first, then a blank
   line, then `## Organizational Context`; assert
   `${rendered}.lastIndexOf('## Organizational Context')` equals the start
   offset of the org-section (the marker contract's last-occurrence
   property).
3. **absent slot** — no `organizational-context.yaml`, teamInstructions
   present; rendered file contains no `## Organizational Context`.
4. **empty slot (`{}`)** — file present but all concerns empty; rendered
   file contains no `## Organizational Context` and is byte-identical to
   case 3's output for the same teamInstructions.
5. **slot-only, no teamInstructions** — `.claude/CLAUDE.md` IS written
   (regression test for the old gate that skipped on falsy
   `teamInstructions`).
6. **idempotence** — populated slot + run twice with `--output=<tmpdir>`;
   second run's `.claude/CLAUDE.md` is byte-identical to the first run's.

**Verify:**

- `bun run test products/pathway/test/cli-command.test.js` (or the new test
  file) exits 0.
- `bun run check` exits 0 (no leftover unused imports or lint failures
  from the threading work).
- Smoke check from a clean dir against current starter (slot still absent
  in starter until Step 5):
  ```sh
  cd /tmp && rm -rf orgctx-smoke && mkdir orgctx-smoke && cd orgctx-smoke
  cp -r $REPO/products/map/starter ./data
  bunx fit-pathway agent software_engineering --track=platform --output=. --data=./data
  test ! -f .claude/CLAUDE.md || rg -q '## Organizational Context' .claude/CLAUDE.md && exit 1 || true
  # passes Step 4 alone: no slot file → no org section in CLAUDE.md
  ```

## Step 5 — Starter populated slot

Land the starter example so a fresh `npx fit-pathway agent` against the
starter renders the design's reference section verbatim. Values are
placeholders, not real handles.

**Created:** `products/map/starter/organizational-context.yaml`

```yaml
# Installation-scoped per-team facts surfaced into the rendered
# .claude/CLAUDE.md by `npx fit-pathway agent`. Edit these values to
# match your team; delete this file entirely if the section should not
# render. See:
# https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md

repositories:
  - molecularforge
  - data-lake-infra
  - api-gateway
team: pharma-platform
manager: athena
adjacentLeads:
  - handle: iris
    role: DX
  - handle: prometheus
    role: DS/AI
projects:
  - drug-discovery-pipeline
  - lab-data-portal
escalationPaths:
  - trigger: production page after hours
    destination: pagerduty://pharma-platform-oncall
  - trigger: security incident
    destination: security@pharma.example.com
```

**Verify:**

- `bunx fit-map validate --data=products/map/starter` exits 0 with no
  warnings citing the new file.
- `cd /tmp && rm -rf orgctx-starter && mkdir orgctx-starter && cd orgctx-starter && bunx fit-pathway agent software_engineering --track=platform --output=. --data=$REPO/products/map/starter` produces a `.claude/CLAUDE.md` whose
  org-context section is byte-identical to the design's reference output
  (test runner: Step 6's populated-starter test makes this mechanical).

## Step 6 — Pre-change baseline fixture + regression tests

The byte-identical-absent claim needs an empirical anchor: a snapshot of
today's `.claude/CLAUDE.md` for `software_engineering --track=platform`
against the starter **without the slot file**. Capture must happen against
`main` before any code change merges; the implementer captures it via a
post-checkout-pre-Step-1 step described below, then commits the fixture.

**Capture procedure** (executed once, output committed verbatim — no edits):

```sh
# From repo root on the plan branch, before Step 1's code change runs.
# This produces the baseline that compares against the post-change
# absent-slot output.
git stash --keep-index   # save WIP if any
git checkout origin/main -- products/map/starter products/pathway products/map libraries/libskill

WORK=$(mktemp -d /tmp/orgctx-baseline.XXXXX)
cp -r products/map/starter "$WORK/data"
# Sanity: the slot file should NOT exist on main (pre-spec-920 state).
test ! -f "$WORK/data/organizational-context.yaml"

cd "$WORK"
bunx fit-pathway agent software_engineering --track=platform --output=. --data=./data
cp .claude/CLAUDE.md "$REPO/products/pathway/test/fixtures/claude-md-baseline-se-platform.md"

cd "$REPO"
git checkout HEAD -- products/map/starter products/pathway products/map libraries/libskill
git stash pop || true
```

The fixture file path is `products/pathway/test/fixtures/claude-md-baseline-se-platform.md`.
Create the `fixtures/` directory if it does not already exist.

**Created:** `products/pathway/test/agent-baseline.test.js`. Two cases, both
running the full agent command against a temp dir populated from the starter:

1. **Byte-identical absent-slot.** Copy `products/map/starter/` into a
   temp dir, remove `organizational-context.yaml`, run
   `bunx fit-pathway agent software_engineering --track=platform --output=. --data=./data`,
   read `.claude/CLAUDE.md`, assert bytes match the fixture file from the
   capture procedure above.
2. **Populated starter renders the reference section.** Copy
   `products/map/starter/` into a temp dir **without** removing the slot
   file, run the same command, assert the rendered file contains:
   - The exact reference section block from design § Rendered Section.
   - `manager: athena` value appears verbatim.
   - Both escalation triggers and both destinations appear verbatim.
   - The placeholder repos (`molecularforge`, `data-lake-infra`,
     `api-gateway`) appear verbatim.
   - The section starts at or after the file's halfway point (sanity check
     on "appended last").

**Verify:**

- `bun run test products/pathway/test/agent-baseline.test.js` exits 0.
- `wc -c products/pathway/test/fixtures/claude-md-baseline-se-platform.md`
  returns a non-zero byte count (sanity — the starter's platform track has
  non-empty `teamInstructions`, so the baseline is non-empty).
- The fixture is committed as a regular file under
  `products/pathway/test/fixtures/` (no `.gitignore` exclusion).

## Step 7 — Guide updates (`agent-teams/organizational-context` and `authoring-standards`)

Update the two guides per the spec's Documentation row. **Note from the
facilitator (release-engineer):** the marker contract uses "match the last
occurrence" of `## Organizational Context` to survive prose collisions inside
`teamInstructions`. This step must explicitly write down the last-occurrence
rule, since downstream tooling will get it wrong if it isn't documented.

**Modified:**
`websites/fit/docs/products/agent-teams/organizational-context/index.md`.
Edits land in three places:

(a) Reframe the page from "three-layer architecture" to "four-layer
architecture": add the Organizational Context slot as Layer 0 (or as Layer 1a
sibling under Team Instructions — implementer's discretion on layer
numbering, but the content must distinguish it from the track-scoped
`teamInstructions` so future readers do not repeat the persona's misdiagnosis
in spec 920).

(b) Add a `## Use the organizational context slot` section near the top
explaining:

- The slot lives at `data/pathway/organizational-context.yaml`
  (installation-scoped, sibling of `claude-settings.yaml`).
- The six concerns it carries and the exact YAML shape (lift the design's
  Data Shape block).
- The rendered section's exact form (lift the design's Rendered Section
  block).
- When to use it vs. track-scoped `teamInstructions` ("team facts that
  change with the team — repos, manager, oncall — go here; team behaviours
  that match the track everywhere it's used — golden paths, conventions —
  stay in `teamInstructions`").

(c) Add a `## Marker contract for downstream tooling` section that documents
the marker contract verbatim:

- The section opens with the literal line `## Organizational Context`.
- Downstream tools detect the section by exact-string match on that line.
- **Tooling that needs the unique occurrence MUST match the LAST occurrence
  of `## Organizational Context` in the rendered `.claude/CLAUDE.md`** —
  the section is always appended last, so the final match is robust against
  the unlikely case that a track author writes that heading inside
  `teamInstructions` prose. (This is the facilitator's nice-to-have, and
  the implementer keeps the bold emphasis on "LAST" so the rule is visible
  at a glance.)
- A worked example (one short shell snippet): `awk '/^## Organizational
  Context$/{i=NR} END{print i}' .claude/CLAUDE.md` returns the line number
  of the section.

**Modified:** `websites/fit/docs/products/authoring-standards/index.md`. Add
a new section between Step 6 (Drivers) and Step 7 (Configure the standard):

- New `## Step 7: Add organizational context (optional)` (renumbering Step 7
  → Step 8 throughout the file).
- Body: one-paragraph framing (installation-scoped per-team facts, sibling
  of the existing settings files), the YAML shape with placeholder values,
  the rendered output it produces, and a one-line "run `bunx fit-map
  validate` to confirm the slot parses." Link forward to the org-context
  guide for the rendering and marker contract.

**Verify:**

- `bunx fit-doc build --src=websites/fit` exits 0 (the websites build hook
  enforces card-partial validity; new headings do not invalidate any
  existing partial).
- `rg -n 'LAST occurrence' websites/fit/docs/products/agent-teams/organizational-context/index.md`
  returns ≥1 hit (the facilitator's marker rule made explicit).
- `rg -nc '## Organizational Context' websites/fit/docs/products/agent-teams/organizational-context/index.md`
  returns ≥2 hits (one as the documented marker, plus the worked example).
- `rg -n '^## Step ' websites/fit/docs/products/authoring-standards/index.md`
  returns 8 consecutive steps numbered 1–8 (the renumbering completed).
- Spell-check (`bun run check` if it includes prose linting, otherwise
  visual): "Organizational Context" is the exact title in every reference
  to the marker.

## Step 8 — CLI `--help` + skill `## Documentation` parity

Confirm the org-context guide URL appears in **the same position** in both
the CLI `documentation` array and the skill's `## Documentation` section.
The URL is already present in both surfaces today
(`https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md`);
this step verifies that Step 7's guide edits did not change the URL or shift
its position, and updates the `description` field on both sides if Step 7's
new framing warrants it.

**Modified:** `products/pathway/bin/fit-pathway.js` § `documentation`. If the
description needs updating, edit only the matching entry's `description`
field — URL and array position are immutable in this step.

**Modified:** `.claude/skills/fit-pathway/SKILL.md` § `## Documentation`. Same
rule: if the line's description changes, change only the description text;
the URL and bullet position remain identical.

**Verify:**

- `rg -n 'agent-teams/organizational-context' products/pathway/bin/fit-pathway.js`
  returns exactly 1 hit.
- `rg -n 'agent-teams/organizational-context' .claude/skills/fit-pathway/SKILL.md`
  returns exactly 1 hit.
- Order parity script (run from repo root):
  ```sh
  diff \
    <(rg -No 'https://www.forwardimpact.team/docs/[^)"]*' products/pathway/bin/fit-pathway.js) \
    <(rg -No 'https://www.forwardimpact.team/docs/[^)"]*' .claude/skills/fit-pathway/SKILL.md)
  ```
  Exits 0 (the two lists are identical in content and order, per
  `products/CLAUDE.md` § Linking rule).
- `bun run check` exits 0.

## Quality gates (post-Step-8, pre-push)

From repo root, in order:

```sh
bun run format:fix
bun run check
bun run test
```

The diff touches code in three packages (`@forwardimpact/map`,
`@forwardimpact/pathway`, `@forwardimpact/libskill`), schemas, the starter,
two guide pages, the CLI help, and the skill. Expected `git diff --stat`
file count: ~20 (see § File map). Any auto-format ripple on an unrelated
file (e.g. a pre-existing biome warning on `serve.test.js` — observed
2026-05-11 per staff-engineer summary) is **not** part of this diff; either
revert it or land it as a separate `chore(format)` PR before merging.

## Risks

1. **`bun run format:fix` ripple on unrelated files.** Pathway and libskill
   tests currently carry pre-existing biome warnings (recorded in
   staff-engineer summary as "fix-forward `chore(format)` ripple" 2026-05-12);
   `format:fix` will touch them too. The implementer must run
   `git diff origin/main...HEAD --stat`, identify any path outside the File
   Map, and either revert it before push or split it into a separate PR.
2. **Browser preview cache miss.** `getTemplates()` and `getAgentData()` in
   `agent-builder.js` cache template fetches across renders; if the user is
   already on the page when the new code lands, the cache may serve a stale
   shape (no `organizationalContext`). Mitigation: nothing in the plan —
   browser users hard-refresh; this is not a regression of any committed
   API. Documented here only so a reviewer who reproduces the cache miss
   knows it is not a bug.
3. **`#loadRepoFile` precedence surprise.** The Node loader's helper checks
   `<dataDir>/repository/<file>` before `<dataDir>/<file>`. An installer who
   has both files present will silently use the `repository/` copy. The
   loader test in Step 2 case 3 pins this; the guide in Step 7 should not
   mention the legacy path (the starter's canonical position is the data-
   directory root). No mitigation required — pinning the behaviour is the
   point.
4. **Test isolation under `bun test` with starter-copy fixtures.** Steps 4
   and 6 copy `products/map/starter/` into temp dirs and shell out to
   `bunx fit-pathway agent`. Bun's `os.homedir()` divergence (per
   staff-engineer summary recurring patterns) does not affect this path
   because the CLI uses `--data=` rather than home-resolved data, but the
   implementer should run the new tests under both `bun test` and
   `node --test` to catch any runtime-specific path resolution. The
   existing `cli-command.test.js` uses `bun:test`; mirror that runner for
   consistency.
5. **Schema $id collision.** Ajv loads every `*.schema.json` in
   `products/map/schema/json/` and indexes by `$id`. The new schema's
   `$id` follows the existing convention
   (`https://www.forwardimpact.team/schema/json/organizational-context.schema.json`);
   a typo here would surface as a `SCHEMA_NOT_FOUND` error in Step 1's
   validation tests, not a collision, but the implementer should grep the
   schema dir to confirm no other file claims the same `$id`.

## Execution recommendation

Single `staff-engineer` executor, sequential by step (1 → 8). Within a step,
the substeps may be batched into one commit each — small enough that the
implementer can keep the eight commits 1:1 with the eight steps.

Step 7's guide content qualifies for `technical-writer` audience-tuning —
specifically the framing reshuffle in
`agent-teams/organizational-context/index.md` (three layers → four layers) is
a structural prose edit on a published external guide. Recommended split:
`staff-engineer` lands Step 7 verbatim against the plan (the marker contract
content is mechanical), then opens a follow-up `technical-writer` review on
the same PR before pushing for `plan:implemented`. If the
`technical-writer`'s edits land on the same branch in the same commit cycle,
no separate PR is needed.

No decomposition into parts — 8 steps, ~20 files, one feature surface
(spec 920 only). One implementation PR titled `feat(920): pathway
organizational context slot for agent generation`.

— Staff Engineer 🛠️

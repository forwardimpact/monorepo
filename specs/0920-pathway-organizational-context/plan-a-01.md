# Plan 0920-a · Part 01 — Schema, loaders, renderer

Overview: [plan-a.md](plan-a.md) · Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

Lays the data spine. After this part merges, the YAML loads, validates, and
renders into a markdown section, but nothing calls the renderer yet — the
CLI and web surfaces still write today's bytes.

## Step 1 — Schema + validator wiring

Create the Ajv schema and register it in `SCHEMA_MAPPINGS` + `#OPTIONAL_SILENT`.

**Created:** `products/map/schema/json/organizational-context.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://www.forwardimpact.team/schema/json/organizational-context.schema.json",
  "title": "Organizational Context",
  "description": "Installation-scoped per-team context surfaced into the rendered .claude/CLAUDE.md by fit-pathway agent.",
  "type": "object",
  "properties": {
    "repositories": { "type": "array", "items": { "type": "string" } },
    "team": { "type": "string" },
    "manager": { "type": "string" },
    "adjacentLeads": {
      "type": "array",
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
    "projects": { "type": "array", "items": { "type": "string" } },
    "escalationPaths": {
      "type": "array",
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

**Modified:** `products/map/src/schema-validation.js` — add the file to
`SCHEMA_MAPPINGS` (alongside `drivers.yaml`/`levels.yaml`) and to
`#OPTIONAL_SILENT` (alongside `self-assessments.yaml`).

**Created:** `products/map/test/validation-organizational-context.test.js` —
four cases against an injected-fs temp dir:

1. Clean populated slot (six concerns, 2 leads, 2 paths) → `valid: true`.
2. Absent slot → `valid: true`, no `MISSING_FILE` warning.
3. Malformed: missing `destination` inside `escalationPaths` entry + unknown
   top-level key + type mismatch (`repositories: "x"`) → three errors, each
   with non-empty `path`.
4. `{}` (all-empty) → `valid: true`.

**Verify:** `bun run test products/map/test/validation-organizational-context.test.js` exits 0.

## Step 2 — Node + browser loader extensions

Both loaders surface `agentData.organizationalContext` with `null` fallback.

**Modified:** `products/map/src/loader.js` § `loadAgentData`:

```diff
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
       disciplines, tracks, behaviours, claudeSettings, vscodeSettings,
+      organizationalContext,
     };
```

**Modified:** `products/pathway/src/lib/yaml-loader.js` § `loadAgentDataBrowser`:

```diff
 export async function loadAgentDataBrowser(dataDir = "./data") {
-  const [disciplines, tracks, behaviours, claudeSettings, vscodeSettings] =
+  const [
+    disciplines, tracks, behaviours,
+    claudeSettings, vscodeSettings, organizationalContext,
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
+      tryLoadYamlFile(`${dataDir}/repository/organizational-context.yaml`).then(
+        (r) => r ?? tryLoadYamlFile(`${dataDir}/organizational-context.yaml`),
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

The `??` preserves the deliberate `null`-vs-`{}` divergence (design § Key
Decisions row "Loader fallback"). `tryLoadYamlFile` returns `null` on miss;
the `??` keeps it as `null` rather than coercing to `{}`.

**Modified:** `products/map/test/data-loader.test.js` — append three cases
exercising `#loadRepoFile` behavior for the slot:

1. Neither root nor `repository/` present → `organizationalContext: null`.
2. Root file present → parsed YAML returned.
3. Both present → `repository/<file>` wins (matches sibling precedence).

**Verify:** `bun run test products/map/test/data-loader.test.js` exits 0.

## Step 3 — `renderOrganizationalContext` in libskill

Pure function that maps the loaded YAML (or `null`) to a markdown section
string (or `null`).

**Modified:** `libraries/libskill/src/agent.js` — export a new function
directly after `interpolateTeamInstructions`. Contract:

- Input `null` / `undefined` / `{}` / all-empty concerns → return `null`.
- At least one concern has a non-empty value → emit the section.
- Section opens with the literal line `## Organizational Context` followed
  by a blank line, then bullets:
  - `repositories` non-empty → `- **Repositories:** ${items.join(", ")}`
  - `team` non-empty → `- **Team:** ${team}`
  - `manager` non-empty → `- **Manager:** ${manager}`
  - `adjacentLeads` non-empty → `- **Adjacent leads:** ${entries.map(e => "${e.handle} (${e.role})").join(", ")}`
  - `projects` non-empty → `- **Projects:** ${items.join(", ")}`
  - `escalationPaths` non-empty → `- **Escalation paths:**` parent bullet,
    then `  - ${trigger} → ${destination}` one indented sub-bullet per entry.
- Empty / absent fields suppress their bullet (no empty bullets emitted).
- Section ends with exactly one trailing newline (`\n`) after the final
  bullet — no trailing whitespace, no double-blank tail. The composer
  concatenation `${ti}\n\n${os}` relies on this; if the section ends
  `bullet\n` the composed output is `…body\n\n## Organizational Context
  …\n  - last entry\n` with a single terminal newline.

Reference output for the design's populated example (the byte-target the
Part 03 populated-starter test asserts against):

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

**Modified:** `libraries/libskill/src/index.js` — re-export
`renderOrganizationalContext` from `./agent.js`.

**Modified:** `tests/model-agent.test.js` — append a
`describe("renderOrganizationalContext")` block:

1. `null` → `null`. 2. `undefined` → `null`. 3. `{}` → `null`.
4. All-empty concerns slot (`{ repositories: [], team: "", manager: "", adjacentLeads: [], projects: [], escalationPaths: [] }`) → `null`.
5. Only `manager` populated → section with one bullet only.
6. Fully-populated design example → equals the reference output byte-for-byte.
7. `adjacentLeads` with one entry → no trailing comma.
8. `escalationPaths` with one entry → parent bullet + one sub-bullet.
9. `repositories` of length 1 → no commas in the bullet.
10. **Partial-empty:** `repositories` populated but `adjacentLeads: []` and
    `escalationPaths: []` → section emits the `Repositories` bullet only;
    the empty `adjacentLeads` and `escalationPaths` produce no parent
    bullets (exercises the bullet-suppression rule for empty arrays under
    a populated section).
11. **Trailing-newline contract:** section ends with exactly one trailing
    `\n` after the final bullet (not zero, not two) — pins the byte shape
    composer concatenation relies on.

**Verify (run from repo root):** `bun run test tests/model-agent.test.js`
exits 0 (the file at the repo's top-level `tests/` resolves workspace
dependencies — `@forwardimpact/libmock`, `@forwardimpact/libskill` — only
when invoked from the workspace root, not from inside `libraries/libskill/`).
`rg -n 'renderOrganizationalContext' libraries/libskill/src/index.js` returns
one hit (the re-export).

## DO-CONFIRM for Part 01

- `bun run format:fix` clean (no unrelated ripple — check `git diff --stat`).
- `bun run check` exits 0.
- `bun run test` exits 0 across all touched packages.
- `git diff origin/main...HEAD --stat` lists only files in this part's slice
  of the overview File map; any extra file is a ripple to revert or split.

— Staff Engineer 🛠️

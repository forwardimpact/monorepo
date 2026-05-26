# Plan 0920-a · Part 02 — Composer + call sites

Overview: [plan-a.md](plan-a.md) · Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

Depends on: Part 01 merged (`renderOrganizationalContext` exported,
`agentData.organizationalContext` loaded).

Extends `formatTeamInstructions` to accept the org section and threads
`orgSection` through three call sites: CLI (`agent.js` + `agent-io.js`),
web preview (`agent-builder.js` + `agent-builder-preview.js`), and
distribution `build-packs.js`. After this part merges, every surface
emits the section when the slot is populated.

## Step 4a — Composer signature

**Modified:** `products/pathway/src/formatters/agent/team-instructions.js`:

```js
/**
 * Format team instructions + organizational context as CLAUDE.md content.
 *
 * BEHAVIOR CHANGE from pre-spec-0920: this function previously returned
 * `Mustache.render(template, { content: "" })` (an empty rendered template)
 * when input was empty/null. It now returns `null` when both inputs are
 * null/empty/whitespace. All three call sites (CLI `writeTeamInstructions`,
 * web preview `deriveAgentData`, distribution `formatContent`) have been
 * updated to treat `null` as "skip the file/section." The marker-contract
 * last-occurrence rule (downstream tooling matches the LAST `## Organizational
 * Context`) is owned by `renderOrganizationalContext` in libskill and
 * documented in the org-context guide; this composer only guarantees the
 * section is appended after the team-instructions body.
 *
 * @param {string|null} teamInstructions
 * @param {string|null} orgSection
 * @param {string} template
 * @returns {string|null} Rendered content, or null if both inputs empty.
 */
export function formatTeamInstructions(teamInstructions, orgSection, template) {
  const ti = trimValue(teamInstructions);
  const os = trimValue(orgSection);
  if (!ti && !os) return null;
  const content = ti && os ? `${ti}\n\n${os}` : ti || os;
  return Mustache.render(template, { content });
}
```

Existing imports (`Mustache`, `trimValue`) stay.

## Step 4b — CLI call sites

**Modified:** `products/pathway/src/commands/agent.js`. Compute `orgSection`
**once** at the top of `handleAgent` (before the console-vs-file branch) and
pass it into both paths — do NOT call `renderOrganizationalContext` twice.
The CLI console header is made conditional so a slot-only run isn't
mislabeled as "Team Instructions":

```diff
 import {
   ...
   interpolateTeamInstructions,
+  renderOrganizationalContext,
 } from "@forwardimpact/libskill/agent";

-function printTeamInstructions(agentTrack, humanDiscipline, template) {
+function printTeamInstructions(agentTrack, humanDiscipline, orgSection, template) {
   const teamInstructions = interpolateTeamInstructions({ agentTrack, humanDiscipline });
-  if (teamInstructions) {
-    process.stdout.write("# Team Instructions (CLAUDE.md)\n\n");
-    process.stdout.write(formatTeamInstructions(teamInstructions, template) + "\n");
-    process.stdout.write("\n---\n\n");
-  }
+  const content = formatTeamInstructions(teamInstructions, orgSection, template);
+  if (!content) return;
+  // Header reflects what is actually rendered — a slot-only run is not "Team Instructions."
+  const header =
+    teamInstructions && orgSection
+      ? "# Team Instructions + Organizational Context (CLAUDE.md)"
+      : teamInstructions
+        ? "# Team Instructions (CLAUDE.md)"
+        : "# Organizational Context (CLAUDE.md)";
+  process.stdout.write(`${header}\n\n`);
+  process.stdout.write(content + "\n");
+  process.stdout.write("\n---\n\n");
 }
 ...
+  // Computed once — passed to both the console and file paths.
+  const orgSection = renderOrganizationalContext(agentData.organizationalContext);
+
   if (!options.output) {
-    printTeamInstructions(agentTrack, humanDiscipline, claudeTemplate);
+    printTeamInstructions(agentTrack, humanDiscipline, orgSection, claudeTemplate);
     ...
   }
   const teamInstructions = interpolateTeamInstructions({ agentTrack, humanDiscipline });
-  await writeTeamInstructions(teamInstructions, baseDir, claudeTemplate);
+  await writeTeamInstructions(teamInstructions, orgSection, baseDir, claudeTemplate);
```

**Modified:** `products/pathway/src/commands/agent-io.js` § `writeTeamInstructions`:

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

## Step 4c — Web preview call site

**Modified:** `products/pathway/src/pages/agent-builder.js` § `buildDeriveContext`:

```diff
   function buildDeriveContext(combo, level) {
     return {
       ...combo, level,
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

**Modified:** `products/pathway/src/pages/agent-builder-preview.js` § `deriveAgentData`:

```diff
 import {
   ...
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
   const teamInstructions = interpolateTeamInstructions({ agentTrack, humanDiscipline });
-  const teamInstructionsContent = teamInstructions
-    ? formatTeamInstructions(teamInstructions, templates.claude)
-    : null;
+  const orgSection = renderOrganizationalContext(organizationalContext);
+  const teamInstructionsContent = formatTeamInstructions(
+    teamInstructions, orgSection, templates.claude,
+  );
   return { profile, skillFiles, toolkit, teamInstructionsContent };
 }
```

## Step 4d — Distribution `build-packs` call site

**Modified:** `products/pathway/src/commands/build-packs.js`. Two diff blocks:

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
+      teamInstructions, orgSection, templates.claude,
+    ),
     ...
   };
 }
```

**`build-packs.test.js` ripple:** `build-packs.test.js` imports
`runAgentCommand` (line 25) and exercises pack assembly end-to-end. The
return-shape change in `derivePackContent` flows through the same pipeline
the test already runs; if the existing test asserts on the `teamInstructions`
field of pack content for a non-empty track (the starter's platform track),
the assertion holds — the rendered string changes only when the slot is
populated, which the existing test fixture does not set up (slot ships in
Part 03, not now). After Step 4d lands, run `bun run test products/pathway/test/build-packs.test.js`
and confirm exit 0; if a snapshot assertion needs an updated golden because
the test fixture happens to include a populated slot, regenerate it.

**Scope clarification for `agent-builder-download.js`:** the download button
consumes `teamInstructionsContent` (already updated by Step 4c) and reads
`claudeSettings` / `vscodeSettings` directly from `agentData`. The
organizational-context slot flows into the zip via `teamInstructionsContent`;
no separate handling is required in the download path.

## Step 4e — CLI integration tests

**Created:** `products/pathway/test/agent-command.test.js`. Do NOT add these
cases to `products/pathway/test/cli-command.test.js` — that file tests
`getCliCommand` URL routing and has no `runAgentCommand` infrastructure.
Use the `mkdtempSync` + `tmpdir` + `runAgentCommand` pattern from
`products/pathway/test/build-packs.test.js` (which already imports
`runAgentCommand` and stages temp data dirs from `products/map/starter`).

Seven cases (the seventh is the marker-contract collision case — required to
prove the LAST-occurrence rule survives prose collisions):

| Case | Slot | `teamInstructions` | Assertion |
| --- | --- | --- | --- |
| 1 | populated | populated | Rendered file contains the team-instructions body first, then `\n\n`, then `## Organizational Context`. |
| 2 | populated | absent | `.claude/CLAUDE.md` written; contains section; no "Team Instructions" prose. |
| 3 | absent | populated | No `## Organizational Context` in rendered file. |
| 4 | `{}` (all-empty) | populated | Byte-identical to case 3. |
| 5 | populated | absent | `.claude/CLAUDE.md` IS written (regression for old skip-on-falsy gate). |
| 6 | populated | populated | Run twice; second `.claude/CLAUDE.md` byte-identical to first (idempotence). |
| 7 | populated | **synthetic teamInstructions containing literal `## Organizational Context` heading mid-body** | The rendered file contains the marker TWICE; the **last** occurrence anchors the actual section's bullets; the earlier occurrence inside the teamInstructions body is followed by the prose the synthetic track author wrote. This is the substantive last-occurrence test that protects the marker contract — without it, the rule is trivially true on any single-marker file. |

## DO-CONFIRM for Part 02

- `bun run format:fix` clean (no unrelated ripple).
- `bun run check` exits 0.
- `bun run test` exits 0 across all touched packages.
- Smoke check (slot still absent in starter until Part 03):

```sh
cd /tmp && rm -rf orgctx-smoke && mkdir orgctx-smoke && cd orgctx-smoke
cp -r $REPO/products/map/starter ./data
bunx fit-pathway agent software_engineering --track=platform --output=. --data=./data
test -f .claude/CLAUDE.md && ! rg -q '## Organizational Context' .claude/CLAUDE.md
```

- `git diff origin/main...HEAD --stat` lists only the files in this part's
  slice of the overview File map.

— Staff Engineer 🛠️

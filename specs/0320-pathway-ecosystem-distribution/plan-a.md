# 320 — Plan: Pathway Ecosystem Distribution

## Approach

Add a `generatePacks` function to `build.js` alongside the existing
`generateBundle`. For each valid discipline/track combination, reuse the
agent-derivation functions from libskill to produce the same files
`fit-pathway agent --output` writes today, archive each as a `.tar.gz` pack, and
emit two manifest files — one for `npx skills` (well-known discovery) and one
for Microsoft APM — both derived from a single in-memory list so they cannot
desync.

All new output lands in `outputDir/packs/` alongside the existing
`bundle.tar.gz` and `install.sh`. No new files besides the test, no new
dependencies, no changes to the existing install path.

**Key design decisions:**

1. **Everything in `build.js`.** `generatePacks` lives alongside
   `generateBundle` in the same file — same pattern, same proximity to the
   caller. No dynamic import, no separate module resolution. The additional
   imports (libskill functions, formatters, crypto, template loader) go at the
   top of `build.js`.

2. **tar.gz over zip.** The existing bundle pipeline already shells out to
   `tar`. The `npx skills` archive type (`"archive"`) accepts tar.gz. APM's
   `apm pack` also produces tar.gz. Staying with tar.gz avoids adding a zip
   dependency.

3. **Deterministic output for byte-identical builds.** Archives must be
   reproducible (spec req 7). Use `--sort=name`, `--mtime='1970-01-01'`,
   `--owner=0`, `--group=0`, and `--numeric-owner` flags on `tar` to strip
   filesystem metadata. JSON manifests use sorted keys.

4. **Well-known discovery for `npx skills`.** The skills CLI fetches
   `<url>/.well-known/agent-skills/index.json`. Each pack is listed as
   `type: "archive"` with a `sha256:` digest. This is the Cloudflare/Vercel
   agent-skills discovery RFC format (schema version 0.2.0).

5. **APM manifest as `apm.yml` at site root.** APM resolves packages by fetching
   a manifest from the target URL. We emit a top-level `apm.yml` listing each
   pack as a skill entry with its download URL.

---

## Step 1 — Add imports to `build.js`

**File:** `products/pathway/src/commands/build.js`

Add these imports at the top, alongside the existing ones:

```js
import { createHash } from "crypto";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import {
  generateStageAgentProfile,
  deriveReferenceLevel,
  deriveAgentSkills,
  generateSkillMarkdown,
  interpolateTeamInstructions,
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { findValidCombinations } from "./agent.js";
```

`createDataLoader` is already imported. `createTemplateLoader` is the only new
package import — `@forwardimpact/libtemplate` is already a dependency of
pathway.

---

## Step 2 — Export `findValidCombinations` from `agent.js`

**File:** `products/pathway/src/commands/agent.js`

Add `export` to the function declaration (line 97):

```js
// Before
function findValidCombinations(data, agentData) {
// After
export function findValidCombinations(data, agentData) {
```

No other changes. Existing callers within the file are unaffected.

---

## Step 3 — Add `generatePacks` function to `build.js`

**File:** `products/pathway/src/commands/build.js`

Add `generatePacks` after the existing `generateBundle` function. Signature:

```js
async function generatePacks({ outputDir, dataDir, siteUrl, framework }) {
```

**Data and template loading** — done inside the function, same pattern as
`bin/fit-pathway.js:427–430`:

```js
const version = getPathwayVersion();
const loader = createDataLoader();
const templateLoader = createTemplateLoader(join(appDir, "..", "templates"));
const data = await loader.loadAllData(dataDir);
const agentData = await loader.loadAgentData(dataDir);
const skillsWithAgent = await loader.loadSkillsWithAgentData(dataDir);
```

`appDir` is already defined at module scope in `build.js` (line 29).
`getPathwayVersion()` is already defined in the same file.

**Pack generation loop** — for each valid combination:

1. Derive the agent name:
   `${getDisciplineAbbreviation(discipline.id)}-${toKebabCase(track.id)}`
2. Compute `stageParams` and call `generateStageAgentProfile` for each stage
   (same as `handleAllStages` in `agent.js`)
3. Call `deriveAgentSkills` + `generateSkillMarkdown` for skills
4. Load templates via `templateLoader.load("agent.template.md", dataDir)` etc.
5. Write files to `outputDir/_packs/<agent-name>/.claude/...` using the
   formatter functions (`formatAgentProfile`, `formatAgentSkill`, etc.) and
   direct `writeFile` calls — no console logging
6. Archive with deterministic tar (Step 4 below)
7. Compute SHA-256 digest
8. Collect `{ name, description, url, digest }` into an array

After the loop, emit both manifests (Steps 5–6 below), then clean up `_packs/`.

**Pack file layout** (mirrors `agent-io.js` output exactly):

```
_packs/<agent-name>/
  .claude/
    agents/
      <stage>.agent.md        (one per stage)
    skills/
      <skill-name>/
        SKILL.md
        scripts/install.sh    (if present)
        references/REFERENCE.md (if present)
    CLAUDE.md                 (team instructions)
    settings.json             (Claude Code settings)
```

**Why call formatters directly instead of `agent-io.js` write functions:** Those
functions log each file and merge with existing settings on disk. Pack
generation needs clean, silent writes to a temp directory. The formatters are
the right reuse boundary.

---

## Step 4 — Deterministic tar archiving

Inside the pack loop, after writing files for each combination:

```js
execFileSync("tar", [
  "-czf", join(outputDir, "packs", `${agentName}.tar.gz`),
  "--sort=name",
  "--mtime=1970-01-01",
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  "-C", join(outputDir, "_packs", agentName),
  "."
]);
```

**Determinism flags:**

- `--sort=name` — consistent file ordering regardless of filesystem
- `--mtime=1970-01-01` — strips modification timestamps
- `--owner=0 --group=0 --numeric-owner` — strips user/group metadata

**Platform note:** macOS bsdtar supports `--sort=name` since Big Sur. The
monorepo targets darwin 24.6.0.

**SHA-256 digest** — computed immediately after archiving:

```js
const content = await readFile(archivePath);
const digest = "sha256:" + createHash("sha256").update(content).digest("hex");
```

---

## Step 5 — Emit `npx skills` discovery manifest

**File written:** `outputDir/.well-known/agent-skills/index.json`

Format follows the agent-skills discovery RFC (schema 0.2.0):

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "se-platform",
      "type": "archive",
      "description": "Software Engineering (Platform Track) — agent team",
      "url": "https://<siteUrl>/packs/se-platform.tar.gz",
      "digest": "sha256:abc123..."
    }
  ]
}
```

- `name` uses the same `${abbrev}-${toKebabCase(trackId)}` naming
- `url` is `${siteUrl}/packs/${agentName}.tar.gz`
- JSON serialized with sorted keys for determinism

---

## Step 6 — Emit APM manifest

**File written:** `outputDir/apm.yml`

```yaml
name: <framework-title-slugified>
version: <pathway-version>
description: "<framework-title> agent teams for Claude Code"

skills:
  - name: se-platform
    description: "Software Engineering (Platform Track)"
    url: "<siteUrl>/packs/se-platform.tar.gz"
    digest: "sha256:abc123..."
```

Built with string concatenation — the structure is flat, no YAML library needed.

---

## Step 7 — Call `generatePacks` from `runBuildCommand`

**File:** `products/pathway/src/commands/build.js`

**Before (lines 205–208):**

```js
const siteUrl = options.url || framework.distribution?.siteUrl;
if (siteUrl) {
  await generateBundle({ outputDir, dataDir, siteUrl, framework });
}
```

**After:**

```js
const siteUrl = options.url || framework.distribution?.siteUrl;
if (siteUrl) {
  await generateBundle({ outputDir, dataDir, siteUrl, framework });
  await generatePacks({ outputDir, dataDir, siteUrl, framework });
}
```

Update the summary output (line 215) to mention packs:

```js
${siteUrl ? `\nDistribution:\n  ${outputDir}/bundle.tar.gz\n  ${outputDir}/install.sh\n  ${outputDir}/packs/ (agent/skill packs)\n  ${outputDir}/.well-known/agent-skills/index.json\n  ${outputDir}/apm.yml\n` : ""}
```

---

## Step 8 — Tests

**File:** `products/pathway/src/commands/build.test.js` (new)

Tests use the existing starter data at `products/pathway/starter/` as input.

1. **Pack generation produces expected archives.** Run `generatePacks` against
   starter data with a test `siteUrl`. Verify:
   - `packs/` directory contains one `.tar.gz` per valid combination
   - Count matches `findValidCombinations` output
   - Each archive extracts to a directory with `.claude/agents/`,
     `.claude/skills/`, `.claude/CLAUDE.md`, `.claude/settings.json`

2. **Content parity with CLI path.** For one combination, run
   `fit-pathway agent <discipline> --track=<track> --output=<tmpdir>` and
   compare the output files against the extracted pack. Files must match
   byte-for-byte.

3. **Skills discovery manifest is valid.** Parse
   `.well-known/agent-skills/index.json`:
   - Has `$schema` field
   - Each entry has `name`, `type: "archive"`, `description`, `url`, `digest`
   - URLs resolve relative to `siteUrl`
   - Digest matches actual SHA-256 of the corresponding archive

4. **APM manifest is valid.** Parse `apm.yml`:
   - Has `name`, `version`, `skills` array
   - Each skill entry has `name`, `url`, `digest`
   - Version matches pathway package.json version

5. **Reproducibility.** Run `generatePacks` twice with identical input. All
   `.tar.gz` files must be byte-identical. All manifest content must be
   identical.

6. **Existing bundle is unchanged.** After a full `runBuildCommand` with
   `siteUrl`, verify `bundle.tar.gz` and `install.sh` are present and unchanged
   from a build without packs.

---

## File Change Summary

| File                                          | Action | Purpose                                                            |
| --------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `products/pathway/src/commands/build.js`      | Modify | Add imports, `generatePacks` function, call from `runBuildCommand` |
| `products/pathway/src/commands/agent.js`      | Modify | Export `findValidCombinations`                                     |
| `products/pathway/src/commands/build.test.js` | Create | Tests for pack generation and manifests                            |

---

## Risks and Open Questions

1. **macOS tar determinism.** The `--sort=name` flag is supported on macOS Big
   Sur+ (bsdtar 3.5+). Mitigation: the monorepo targets darwin 24.6.0.

2. **APM format stability.** Microsoft APM is early-stage. The manifest format
   may change. The `apm.yml` generation is a small string-building block within
   `generatePacks` — easy to update.

3. **`npx skills` well-known discovery adoption.** The `.well-known` discovery
   path follows the published RFC but is relatively new. If `npx skills` does
   not yet support URL-based discovery at implementation time, verify against
   the current CLI version and adjust the manifest path if needed.

4. **Large number of combinations.** If a framework has many disciplines and
   tracks, the cartesian product could produce many packs. The starter data has
   a manageable number. The loop should log progress so large builds give
   feedback.

5. **Integration testing against `npx skills` and APM.** The automated tests
   validate manifest structure and archive contents but do not invoke the actual
   tools. The spec's success criteria 2 and 3 require the packs to install
   cleanly. This must be verified manually after implementation by running
   `npx skills add` and `apm install` against a locally served build output.

6. **Existing `bundle.tar.gz` stays non-deterministic.** The deterministic tar
   flags apply only to pack archives. The existing `generateBundle` is
   intentionally unchanged — spec req 7 applies to packs, not the CLI bundle.

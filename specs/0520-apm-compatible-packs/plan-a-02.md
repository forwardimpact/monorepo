# 520 — Plan Part 02: Add APM Pipeline

Adds the three new pieces of logic identified in the design: layout transformer,
`archiveApmPack`, and rewritten `writeApmManifest`. Also adds `getRawCommand` to
the install module.

## Lint constraint: max-lines

`build-packs.js` uses ~383 of the 400 non-blank, non-comment lines allowed by
`eslint.config.js`. Adding ~30 lines of new logic would breach the limit. To
stay within bounds, extract all APM-specific logic (`transformToApmLayout` and
`archiveApmPack`) into a new sibling module `build-packs-apm.js`. This module
exports two functions consumed by `generatePacks` in `build-packs.js`.

| File                 | Responsibility                                              |
| -------------------- | ----------------------------------------------------------- |
| `build-packs.js`     | Orchestration, raw channel, skills channel (unchanged size) |
| `build-packs-apm.js` | `transformToApmLayout`, `archiveApmPack`                    |

`build-packs-apm.js` imports `collectPaths`, `resetTimestamps`, and `slugify`
from `build-packs.js`, so those three helpers must be exported (add `export`
keyword — no other changes).

## Steps

### Step 1: Add `build-packs-apm.js` with layout transformer

**File:** `products/pathway/src/commands/build-packs-apm.js` _(new)_

Create the file with the layout transformer function.

**Logic:**

```js
async function transformToApmLayout(claudeStagingDir, apmStagingDir) {
  const apmSkillsDir = join(apmStagingDir, ".apm", "skills");
  const apmAgentsDir = join(apmStagingDir, ".apm", "agents");
  await mkdir(apmSkillsDir, { recursive: true });
  await mkdir(apmAgentsDir, { recursive: true });

  // Copy skills: .claude/skills/{name}/ → .apm/skills/{name}/
  const srcSkillsDir = join(claudeStagingDir, ".claude", "skills");
  const skillDirs = (await readdir(srcSkillsDir, { withFileTypes: true }))
    .filter(e => e.isDirectory());
  for (const dir of skillDirs) {
    await cp(join(srcSkillsDir, dir.name), join(apmSkillsDir, dir.name), { recursive: true });
  }

  // Copy agents: .claude/agents/{name}.md → .apm/agents/{name}.agent.md
  const srcAgentsDir = join(claudeStagingDir, ".claude", "agents");
  const agentFiles = (await readdir(srcAgentsDir))
    .filter(f => f.endsWith(".md"));
  for (const file of agentFiles) {
    const apmName = file.replace(/\.md$/, ".agent.md");
    await cp(join(srcAgentsDir, file), join(apmAgentsDir, apmName));
  }

  // CLAUDE.md and settings.json are intentionally dropped — no APM primitive
}
```

**Key decisions:**

- Separate staging directory — does not mutate the `.claude/` staging that
  `archiveRawPack` and `writeSkillsPack` still read.
- Agent files get the `.agent.md` extension APM requires.
- `CLAUDE.md` and `settings.json` are excluded (per spec § Content coverage).

### Step 2: Add per-bundle `apm.yml` generation

At the end of `transformToApmLayout`, write the per-bundle `apm.yml`:

```js
  const apmYml = `name: ${packName}\nversion: ${version}\n`;
  await writeFile(join(apmStagingDir, "apm.yml"), apmYml, "utf-8");
```

This means the function signature expands to include `packName` and `version`:

```js
async function transformToApmLayout(claudeStagingDir, apmStagingDir, packName, version)
```

### Step 3: Add `archiveApmPack` function

**File:** `products/pathway/src/commands/build-packs-apm.js`

Add in the same new module. Identical archiving strategy — different input
directory and output filename:

```js
async function archiveApmPack(apmStagingDir, archivePath) {
  await resetTimestamps(apmStagingDir);
  const files = await collectPaths(apmStagingDir);
  files.sort();
  const tarBuf = execFileSync("tar", [
    "--no-recursion", "-cf", "-", "-C", apmStagingDir, ...files,
  ]);
  const gzBuf = execFileSync("gzip", ["-n"], { input: tarBuf });
  await writeFile(archivePath, gzBuf);
}
```

No digest return — the site-root `apm.yml` no longer includes digests (per
design § `writeApmManifest` rewritten). Also update `archiveRawPack` (the
renamed `archivePack`) to drop its digest computation and return value — the
`readFile` + `createHash` block at the end becomes dead code since neither
caller uses the digest. Remove the `createHash` import if no other consumer
remains.

### Step 3b: Export helpers from `build-packs.js`

**File:** `products/pathway/src/commands/build-packs.js`

Add `export` to `collectPaths`, `resetTimestamps`, and `slugify` so
`build-packs-apm.js` can import them. No other changes to these functions.

### Step 4: Rewrite `writeApmManifest`

**File:** `products/pathway/src/commands/build-packs.js`

Replace the current `writeApmManifest` body. The new signature drops `digest`
from the pack entries:

```js
async function writeApmManifest(outputDir, packs, version, frameworkTitle) {
  const lines = [
    `name: ${slugify(frameworkTitle)}`,
    `version: ${version}`,
    `description: ${yamlQuote(`${frameworkTitle} agent teams for Claude Code`)}`,
    "",
    "dependencies:",
    "  apm:",
  ];
  for (const pack of packs) {
    lines.push(`    - name: ${pack.name}`);
    lines.push(`      description: ${yamlQuote(pack.description)}`);
    lines.push(`      url: ${yamlQuote(pack.url)}`);
  }
  lines.push("");
  await writeFile(join(outputDir, "apm.yml"), lines.join("\n"), "utf-8");
}
```

**Changes from current:**

- `skills:` → `dependencies:\n  apm:` (valid APM project manifest)
- Indentation: pack entries are 4+2 spaces (under `apm:` list)
- `version` and `digest` fields removed from per-pack entries
- Pack URLs now reference `.apm.tar.gz` (set at the call site)

### Step 5: Update `generatePacks` orchestration

**File:** `products/pathway/src/commands/build-packs.js`

Add an import at the top of `build-packs.js`:

```js
import { transformToApmLayout, archiveApmPack } from "./build-packs-apm.js";
```

In the per-combination loop (currently lines ~514–566), add after
`writePackFiles` and before `archiveRawPack`:

```js
    // APM staging: transform .claude/ layout → .apm/ layout
    const apmStagingDir = join(stagingDir, `${agentName}-apm`);
    await mkdir(apmStagingDir, { recursive: true });
    await transformToApmLayout(packDir, apmStagingDir, agentName, version);

    // Archive both channels
    const rawArchivePath = join(packsDir, `${agentName}.raw.tar.gz`);
    await archiveRawPack(packDir, rawArchivePath);

    const apmArchivePath = join(packsDir, `${agentName}.apm.tar.gz`);
    await archiveApmPack(apmStagingDir, apmArchivePath);
```

Update the `packs.push(...)` URL to reference `.apm.tar.gz`:

```js
    packs.push({
      name: agentName,
      description,
      url: `${normalizedSiteUrl}/packs/${agentName}.apm.tar.gz`,
    });
```

The `digest` field is dropped from the pack metadata object since
`writeApmManifest` no longer uses it. Per Step 3, `archiveRawPack` no longer
computes or returns a digest either.

Add a logger line for the APM bundle:

```js
    logger.info(`   ✓ packs/${agentName}.apm.tar.gz`);
```

Update the staging cleanup to also remove APM staging dirs. Since the APM
staging dirs (`${agentName}-apm`) are children of `stagingDir`, the existing
`rm(stagingDir, { recursive: true })` already handles this.

### Step 6: Add `getRawCommand` in `agent-builder-install.js`

**File:** `products/pathway/src/pages/agent-builder-install.js`

Add after the `normalizeSiteUrl` function:

```js
export function getRawCommand(siteUrl, packName) {
  const url = `${normalizeSiteUrl(siteUrl)}/packs/${packName}.raw.tar.gz`;
  return `curl -sL ${url} | tar xz`;
}
```

### Step 7: Update `createInstallSection` to show all three channels

**File:** `products/pathway/src/pages/agent-builder-install.js`

Add the raw channel to the install section. Update the `createInstallSection`
function to derive and render all three commands:

```js
  const packName = getPackName(discipline, track);
  const rawCommand = getRawCommand(siteUrl, packName);
  const apmCommand = getApmCommand(siteUrl, packName);
  const skillsCommand = getSkillsCommand(siteUrl, packName);
```

Update the `createInstallSection` return value. The current
`agent-install-commands` div has two command blocks (APM, skills). Replace with
three blocks (raw, APM, skills) and add a content-coverage note after the APM
block:

```js
    div(
      { className: "agent-install-commands" },
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "Direct download"),
        createCommandPrompt(rawCommand),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "Microsoft APM"),
        createCommandPrompt(apmCommand),
        p(
          { className: "text-muted agent-install-note" },
          "apm unpack installs skills and agent profiles. Team instructions " +
            "and Claude Code settings require the direct download path.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "npx skills"),
        createCommandPrompt(skillsCommand),
      ),
    ),
```

## Verification

After this part, the source files are complete. Running the build manually
should produce both `.raw.tar.gz` and `.apm.tar.gz` per pack, and the site-root
`apm.yml` should use the `dependencies.apm` format. Tests will fail because they
still assert against old expectations — that is resolved in part 03.

Quick checks:

```
# In a temp dir, run the build and inspect output
ls packs/*.tar.gz        # should see both .raw.tar.gz and .apm.tar.gz per pack
cat apm.yml              # should show dependencies.apm structure
tar -tzf packs/se-platform.apm.tar.gz | head  # should show .apm/ paths
tar -tzf packs/se-platform.raw.tar.gz | head  # should show .claude/ paths
```

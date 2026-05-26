# Plan A — Part 2: Rewire Pathway

Spec: [700](spec.md) · Design: [C](design-c.md) · Overview:
[plan-a.md](plan-a.md)

Depends on: [Part 1](plan-a-01.md) (libpack must exist).

## Scope

Replace Pathway's pack pipeline internals with libpack calls. Delete absorbed
code. Add git install commands to the install UI. Update tests. Amend spec
scope.

## Files

| Action | Path                                                    |
| ------ | ------------------------------------------------------- |
| Modify | `products/pathway/package.json`                         |
| Modify | `products/pathway/src/commands/build-packs.js`          |
| Delete | `products/pathway/src/commands/build-packs-apm.js`      |
| Modify | `products/pathway/src/pages/agent-builder-install.js`   |
| Modify | `products/pathway/test/build-packs.test.js`             |
| Verify | `products/pathway/test/build-packs-apm.test.js`         |
| Verify | `products/pathway/test/build-packs-references.test.js`  |
| Modify | `products/pathway/test/agent-builder-install.test.js`   |
| Modify | `specs/0700-git-installable-packs/spec.md`               |

## Ordering

Steps 1–3 (dependency, rewrite, delete) are sequential. Steps 4–5 (install UI,
tests) depend on 2–3 but are independent of each other. Step 6 (spec amend) is
independent.

---

### Step 1: Add libpack dependency

Add `@forwardimpact/libpack` to Pathway's runtime dependencies.

**Modify** `products/pathway/package.json` — add to `dependencies`:

```json
"@forwardimpact/libpack": "^0.1.0"
```

**Verify:** `bun install` resolves the workspace link.

---

### Step 2: Rewrite `generatePacks` as thin glue

Replace the internals of `build-packs.js` with libpack calls. The public
`generatePacks` export signature is unchanged.

**Modify** `products/pathway/src/commands/build-packs.js`:

**Remove** these internal functions (now in libpack):

| Function              | Replacement                      |
| --------------------- | -------------------------------- |
| `stringifySorted`     | `libpack/util.js`                |
| `writePackFiles`      | `PackStager.stageFull`           |
| `collectPaths`        | `libpack/util.js`                |
| `resetTimestamps`     | `libpack/util.js`                |
| `archiveRawPack`      | `TarEmitter.emit`                |
| `collectFileList`     | `libpack/util.js` (renamed to `collectFiles`) |
| `parseFrontmatter`    | `libpack/util.js`                |
| `buildSkillEntry`     | `libpack/util.js`                |
| `writeSkillsPack`     | `DiscEmitter.emit`               |
| `writeSkillsAggregate`| `DiscEmitter.emitAggregate`      |

**Remove** these imports:

- `stageApmBundle`, `archiveApmPack` from `./build-packs-apm.js`
- `writeSkillReferences` from `./agent-io.js` (no longer called; references are
  now pre-formatted via `formatContent` and written by `PackStager.stageFull`).
  `writeSkillReferences` itself stays in `agent-io.js` — it is still called by
  `writeSkills` in that module. Only the import in `build-packs.js` is removed.

**Keep** in `build-packs.js`:

| Function            | Reason                                                   |
| ------------------- | -------------------------------------------------------- |
| `slugify`           | Used only by `writeApmManifest` — Pathway-specific       |
| `yamlQuote`         | Used only by `writeApmManifest` — Pathway-specific       |
| `derivePackContent` | Calls libskill — domain derivation stays in Pathway      |
| `writeApmManifest`  | APM YAML formatting — Pathway-specific                   |

**Add** a `formatContent` helper that bridges Pathway's formatters to libpack's
`PackStager.stageFull` input shape:

```javascript
function formatContent(
  { profiles, skillFiles, teamInstructions },
  templates,
  settings,
) {
  return {
    agents: profiles.map((p) => ({
      filename: p.filename,
      content: formatAgentProfile(p, templates.agent),
    })),
    skills: skillFiles.map((s) => ({
      dirname: s.dirname,
      files: [
        { path: "SKILL.md", content: formatAgentSkill(s, templates.skill) },
        ...(s.installScript
          ? [{
              path: "scripts/install.sh",
              content: formatInstallScript(s, templates.install),
              mode: 0o755,
            }]
          : []),
        ...(s.references || []).map((ref) => ({
          path: `references/${ref.name}.md`,
          content: formatReference(ref, templates.reference),
        })),
      ],
    })),
    teamInstructions: teamInstructions
      ? formatTeamInstructions(teamInstructions, templates.claude)
      : null,
    claudeSettings: settings.claude,
    vscodeSettings: settings.vscode,
  };
}
```

**Import changes** in `build-packs.js`:

- The existing import `{ formatAgentSkill, formatInstallScript }` from
  `../formatters/agent/skill.js` gains `formatReference` (already exported at
  line 156 of that module, but not currently imported by `build-packs.js` — it
  was consumed indirectly via `writeSkillReferences` in `agent-io.js`).
- All other existing imports (`formatAgentProfile`, `formatTeamInstructions`,
  etc.) stay unchanged.

**Rewrite** `generatePacks` body:

```javascript
export async function generatePacks({
  outputDir, dataDir, siteUrl, standard, version, templatesDir,
}) {
  // 1. Load data (unchanged — loader, templateLoader, agentData, etc.)
  // 2. Derive combinations (unchanged — findValidCombinations)
  // 3. Build formatted content per combination:
  const combinations = validCombinations.map((combo) => {
    const { profiles, skillFiles, teamInstructions } = derivePackContent({
      ...combo, data, agentData, skillsWithAgent, level,
    });
    return {
      name: `${getDisciplineAbbreviation(combo.discipline.id)}-${toKebabCase(combo.track.id)}`,
      description: `${combo.humanDiscipline.specialization || combo.humanDiscipline.name} (${combo.humanTrack.name}) — agent team`,
      content: formatContent(
        { profiles, skillFiles, teamInstructions },
        { agent: agentTemplate, skill: skillTemplates.skill, install: skillTemplates.install, reference: skillTemplates.reference, claude: claudeTemplate },
        { claude: agentData.claudeSettings, vscode: agentData.vscodeSettings },
      ),
    };
  });

  // 4. Construct builder with real emitters
  const builder = new PackBuilder({
    stager: new PackStager(),
    emitters: {
      tar: new TarEmitter(),
      git: new GitEmitter(),
      disc: new DiscEmitter(),
    },
  });

  // 5. Build all packs
  const { packs } = await builder.build({ combinations, outputDir, version });

  // 6. Write apm.yml (Pathway-specific manifest format)
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  await writeApmManifest(
    outputDir,
    packs.map((p) => ({
      ...p,
      url: `${normalizedSiteUrl}/packs/${p.name}.apm.git`,
    })),
    version,
    standard.title || "Engineering Pathway",
  );
}
```

The `apm.yml` URL changes from `.apm.tar.gz` to `.apm.git` — `apm install`
resolves packages via `git ls-remote`, so the URL must point to the git repo.

**Verify:** `bun run check` passes (no lint/format errors). Existing
`build-packs.test.js` tests still pass for non-git assertions.

---

### Step 3: Delete `build-packs-apm.js`

All logic absorbed into libpack (`PackStager.stageApm`, `TarEmitter.emit`).

**Delete** `products/pathway/src/commands/build-packs-apm.js`.

**Verify:** `grep -r "build-packs-apm" products/pathway/src/` returns no hits.

---

### Step 4: Update install UI

Add two new command cards: `apm install` (git URL) and `git clone` (skills git
URL).

**Modify** `products/pathway/src/pages/agent-builder-install.js`:

Add two new exports:

```javascript
export function getApmInstallCommand(siteUrl, packName) {
  return `apm install ${normalizeSiteUrl(siteUrl)}/packs/${packName}.apm.git`;
}

export function getSkillsGitCommand(siteUrl, packName) {
  return `git clone ${normalizeSiteUrl(siteUrl)}/packs/${packName}.skills.git`;
}
```

Update `createInstallSection` — reorder and add cards per design-c table.
`apm install` is the primary APM command (uses native `git ls-remote`);
`apm unpack` becomes the offline fallback. No card is removed (Spec Req 7).

Rewrite the `createInstallSection` body. The existing three-card structure
(lines 96–145) becomes five cards grouped by layout:

```javascript
export function createInstallSection({ discipline, track, siteUrl }) {
  if (!siteUrl) return null;

  const packName = getPackName(discipline, track);

  return section(
    {
      className: "agent-install-section",
      "aria-labelledby": INSTALL_HEADING_ID,
    },
    div(
      { className: "agent-install-header" },
      h2({ id: INSTALL_HEADING_ID }, "📦 Install This Agent Team"),
      p(
        { className: "text-muted agent-install-description" },
        "Install the pre-built pack for this discipline × track combination " +
          "directly through an ecosystem package manager. The pack contains " +
          "the same agent profile, skills, team instructions, and Claude Code " +
          "settings shown below — installed into your project's ",
        code({}, ".claude/"),
        " directory.",
      ),
    ),
    div(
      { className: "agent-install-commands" },
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "Direct download"),
        createCommandPrompt(getRawCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Recommended. Installs everything: skills, agents, CLAUDE.md, and settings (Claude Code + VS Code).",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "apm install"),
        createCommandPrompt(getApmInstallCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Recommended for APM users. Installs skills, agents, and team instructions via native git resolution.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "apm unpack"),
        createCommandPrompt(getApmCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Offline alternative. Downloads the tarball, then unpacks. Does not include settings.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "npx skills"),
        createCommandPrompt(getSkillsCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Installs skills only. Does not include agents or CLAUDE.md.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "git clone"),
        createCommandPrompt(getSkillsGitCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Clone skills as a git repository.",
        ),
      ),
    ),
  );
}
```

**Verify:** Manual inspection of rendered card structure; `bun run check`
passes.

---

### Step 5: Update Pathway tests

Update existing tests and add new assertions for git channels.

**Modify** `products/pathway/test/build-packs.test.js`:

Add after existing archive tests:

```javascript
test("emits one APM git repo and one skills git repo per combination", async () => {
  // readdir packs/, filter for .apm.git and .skills.git directories
  // assert count === validCombinations.length for each
});

test("APM git repo clones and yields APM bundle layout", async () => {
  // git clone packs/{name}.apm.git into temp dir
  // assert .claude/skills/, .claude/agents/, apm.lock.yaml exist
  // assert .claude/settings.json does NOT exist (APM excludes it)
});

test("skills git repo clones and yields skill files", async () => {
  // git clone packs/{name}.skills.git into temp dir
  // readdir — each entry is a skill with SKILL.md
});

test("git repos have version tag", async () => {
  // git ls-remote --tags packs/{name}.apm.git
  // assert output includes v{version}
});

test("second build produces byte-identical git repos", async () => {
  // extend existing byte-identity test to compare .apm.git/ and .skills.git/ trees
});
```

**Modify** `products/pathway/test/build-packs.test.js` — existing byte-identity
test ("second build produces byte-identical archives and manifests"):

The per-pack manifest comparison filter at line ~408 uses
`!n.endsWith(".tar.gz") && n !== ".well-known"` to find per-pack skill
repository directories. After this change, `.apm.git` and `.skills.git`
directories will also match that filter, causing false failures. Update the
filter to also exclude entries ending in `.git`:

```javascript
const packDirs = firstEntries.filter(
  (n) => !n.endsWith(".tar.gz") && !n.endsWith(".git") && n !== ".well-known",
);
```

**Verify:** `products/pathway/test/build-packs-apm.test.js`:

This test file imports `generatePacks` from `build-packs.js` and
`findValidCombinations` from `agent.js` — neither import changes. It does NOT
import from `build-packs-apm.js`. No modifications needed; verify it still
passes after `build-packs-apm.js` deletion.

**Modify** `products/pathway/test/agent-builder-install.test.js`:

Add tests for new command functions:

```javascript
describe("getApmInstallCommand", () => {
  test("uses .apm.git URL for native apm install", () => {
    assert.strictEqual(
      getApmInstallCommand("https://example.com", "se-platform"),
      "apm install https://example.com/packs/se-platform.apm.git",
    );
  });
  test("strips trailing slash", () => { ... });
});

describe("getSkillsGitCommand", () => {
  test("uses .skills.git URL for git clone", () => {
    assert.strictEqual(
      getSkillsGitCommand("https://example.com", "se-platform"),
      "git clone https://example.com/packs/se-platform.skills.git",
    );
  });
  test("strips trailing slash", () => { ... });
});
```

Add drift check:

```javascript
test("apm install command references an emitted git repo", async () => {
  // Verify packs/{name}.apm.git/ directory exists for each combination
});

test("skills git command references an emitted git repo", async () => {
  // Verify packs/{name}.skills.git/ directory exists for each combination
});
```

**Verify:** `cd products/pathway && bun test` — all tests pass.

---

### Step 6: Amend spec scope

Note the library extraction in the spec's Scope section per design-c's
Prerequisites.

**Modify** `specs/0700-git-installable-packs/spec.md` — add to the "Affected
capabilities" list after "Build determinism contract":

```markdown
- Pack distribution library — pack generation logic extracted to
  `libraries/libpack` (selected via design-c)
```

**Verify:** Renders correctly in markdown preview.

---

### Step 7: Verification

Run full Pathway test suite and quality checks:

```sh
bun run check
bun run test
```

All existing tests pass. New git-channel tests pass. No lint or format errors.

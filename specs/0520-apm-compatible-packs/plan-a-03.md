# 520 — Plan Part 03: Update Tests and UI

Updates both test files to match the renamed functions, new archive extensions,
new APM bundle assertions, and the rewritten `apm.yml` format.

## Steps

### Step 1: Update `build-packs.test.js`

**File:** `products/pathway/test/build-packs.test.js`

#### 1a. Update archive extension assertions

The test "emits one archive per valid combination under packs/" (line ~89)
filters for `.tar.gz`. Change the filter to `.raw.tar.gz` and add a parallel
assertion for `.apm.tar.gz`:

```js
test("emits one raw and one APM archive per valid combination", async () => {
  const packsDir = join(outputDir, "packs");
  const entries = await readdir(packsDir);
  const rawArchives = entries.filter(n => n.endsWith(".raw.tar.gz"));
  const apmArchives = entries.filter(n => n.endsWith(".apm.tar.gz"));
  assert.strictEqual(rawArchives.length, validCombinations.length);
  assert.strictEqual(apmArchives.length, validCombinations.length);
});
```

#### 1b. Update archive extraction test

The test "each archive expands to the Claude Code file layout" (line ~100):

- Change `.tar.gz` filter to `.raw.tar.gz` to find the raw archive.

#### 1c. Add APM bundle layout test

Add a new test after the raw archive extraction test:

```js
test("each APM bundle expands to the APM package layout", async () => {
  const packsDir = join(outputDir, "packs");
  const entries = await readdir(packsDir);
  const archive = entries.find(n => n.endsWith(".apm.tar.gz"));
  assert.ok(archive, "expected at least one APM archive");

  const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-extract-"));
  try {
    execFileSync("tar", ["-xzf", join(packsDir, archive), "-C", extractDir]);
    assert.ok(existsSync(join(extractDir, ".apm", "skills")));
    assert.ok(existsSync(join(extractDir, ".apm", "agents")));
    assert.ok(existsSync(join(extractDir, "apm.yml")));

    // Agents use .agent.md extension
    const agents = await readdir(join(extractDir, ".apm", "agents"));
    for (const agent of agents) {
      assert.ok(agent.endsWith(".agent.md"), `agent ${agent} should have .agent.md extension`);
    }

    // Per-bundle apm.yml has name and version
    const apmYml = await readFile(join(extractDir, "apm.yml"), "utf8");
    assert.match(apmYml, /^name: /m);
    assert.match(apmYml, /^version: /m);

    // CLAUDE.md and settings.json must NOT be present in APM bundle
    assert.strictEqual(existsSync(join(extractDir, ".claude")), false,
      "APM bundle must not contain .claude/ directory");
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
});
```

#### 1d. Add APM bundle content parity test

Verify that APM bundle skills/agents are content-identical to raw bundle:

```js
test("APM bundle skills match raw bundle skills", async () => {
  const packsDir = join(outputDir, "packs");
  const { discipline, track } = validCombinations[0];
  const abbrev = getDisciplineAbbreviation(discipline.id);
  const packName = `${abbrev}-${toKebabCase(track.id)}`;

  const rawDir = mkdtempSync(join(tmpdir(), "fit-pathway-raw-"));
  const apmDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-"));
  try {
    execFileSync("tar", ["-xzf", join(packsDir, `${packName}.raw.tar.gz`), "-C", rawDir]);
    execFileSync("tar", ["-xzf", join(packsDir, `${packName}.apm.tar.gz`), "-C", apmDir]);

    // Each skill's SKILL.md content must be identical
    const rawSkills = await readdir(join(rawDir, ".claude", "skills"));
    const apmSkills = await readdir(join(apmDir, ".apm", "skills"));
    assert.deepStrictEqual(rawSkills.sort(), apmSkills.sort());

    for (const skill of rawSkills) {
      const rawContent = await readFile(join(rawDir, ".claude", "skills", skill, "SKILL.md"), "utf8");
      const apmContent = await readFile(join(apmDir, ".apm", "skills", skill, "SKILL.md"), "utf8");
      assert.strictEqual(rawContent, apmContent, `SKILL.md differs for ${skill}`);
    }
  } finally {
    rmSync(rawDir, { recursive: true, force: true });
    rmSync(apmDir, { recursive: true, force: true });
  }
});
```

#### 1e. Update `apm.yml` assertions

The test "apm.yml is well-formed and lists every pack" (line ~268):

Replace:

```js
assert.match(apm, /^skills:$/m);
```

With:

```js
assert.match(apm, /^dependencies:$/m);
assert.match(apm, /^ {2}apm:$/m);
```

Remove the `digest` count assertion (line ~284–285). The rewritten manifest has
no digest fields.

Update the URL regex to match `.apm.tar.gz`:

```js
const urlCount = (apm.match(/^ {6}url: "https:\/\/example\.test/gm) || []).length;
```

Note indentation changes from 4 to 6 spaces (entries are under
`dependencies.apm`).

Update `- name:` indentation from 2 to 4 spaces:

```js
const nameCount = (apm.match(/^ {4}- name: /gm) || []).length;
```

#### 1f. Update CLI parity test

The test "pack contents match CLI agent output" (line ~288): update archive
reference from `.tar.gz` to `.raw.tar.gz`:

```js
join(outputDir, "packs", `${agentName}.raw.tar.gz`),
```

#### 1g. Update determinism test

The test "second build produces byte-identical archives and manifests" (line
~364):

Update the archive filter to check both `.raw.tar.gz` and `.apm.tar.gz`:

```js
const firstRaw = firstEntries.filter(n => n.endsWith(".raw.tar.gz"));
const secondRaw = secondEntries.filter(n => n.endsWith(".raw.tar.gz"));
assert.deepStrictEqual(firstRaw, secondRaw);

const firstApm = firstEntries.filter(n => n.endsWith(".apm.tar.gz"));
const secondApm = secondEntries.filter(n => n.endsWith(".apm.tar.gz"));
assert.deepStrictEqual(firstApm, secondApm);

for (const name of [...firstRaw, ...firstApm]) {
  const a = await readFile(join(outputDir, "packs", name));
  const b = await readFile(join(secondDir, "packs", name));
  assert.ok(a.equals(b), `archive ${name} differs between builds`);
}
```

### Step 2: Update `agent-builder-install.test.js`

**File:** `products/pathway/test/agent-builder-install.test.js`

#### 2a. Update imports

```js
import {
  getPackName,
  getRawCommand,
  getApmCommand,
  getSkillsCommand,
  createInstallSection,
} from "../src/pages/agent-builder-install.js";
```

#### 2b. Rename test describe blocks and assertions

- `describe("getApmInstallCommand")` → `describe("getApmCommand")`
- `describe("getSkillsAddCommand")` → `describe("getSkillsCommand")`
- All call sites: `getApmInstallCommand` → `getApmCommand`,
  `getSkillsAddCommand` → `getSkillsCommand`

#### 2c. Update expected command strings

`getApmCommand` tests — update expected extension from `.tar.gz` to
`.apm.tar.gz`:

```js
test("downloads then unpacks the APM bundle", () => {
  assert.strictEqual(
    getApmCommand("https://example.com", "se-platform"),
    "curl -sLO https://example.com/packs/se-platform.apm.tar.gz && apm unpack se-platform.apm.tar.gz",
  );
});
```

#### 2d. Add `getRawCommand` tests

```js
describe("getRawCommand", () => {
  test("pipes download through tar for direct extraction", () => {
    assert.strictEqual(
      getRawCommand("https://example.com", "se-platform"),
      "curl -sL https://example.com/packs/se-platform.raw.tar.gz | tar xz",
    );
  });

  test("strips a trailing slash from the site URL", () => {
    assert.strictEqual(
      getRawCommand("https://example.com/", "se-platform"),
      "curl -sL https://example.com/packs/se-platform.raw.tar.gz | tar xz",
    );
  });
});
```

#### 2e. Update integration drift checks

The test "every valid combination's getPackName matches an emitted archive"
(line ~153): update the filter to match `.raw.tar.gz`:

```js
const archives = new Set(
  (await readdir(packsDir)).filter(n => n.endsWith(".raw.tar.gz")),
);
// ...
const expected = `${getPackName(humanDiscipline, humanTrack)}.raw.tar.gz`;
```

The test "apm unpack command references a real archive" (line ~170): update the
regex to match `.apm.tar.gz`:

```js
const match = command.match(/\/packs\/([\w-]+\.apm\.tar\.gz)/);
assert.ok(match, "apm command should reference /packs/<name>.apm.tar.gz");
```

## Verification

Run the full test suite:

```
cd products/pathway && bun test test/build-packs.test.js test/agent-builder-install.test.js
```

All tests should pass. Specifically verify:

- Raw archives: `.raw.tar.gz` with `.claude/` layout
- APM archives: `.apm.tar.gz` with `.apm/` layout + `apm.yml`
- Site-root `apm.yml`: `dependencies.apm` format, no digests
- Determinism: both raw and APM archives are byte-identical across builds
- Command strings: all three channels produce correct commands
- Integration drift: pack names match emitted archives for both channels

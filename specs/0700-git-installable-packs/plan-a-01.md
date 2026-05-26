# Plan A — Part 1: Create `libraries/libpack`

Spec: [700](spec.md) · Design: [C](design-c.md) · Overview:
[plan-a.md](plan-a.md)

## Scope

Create `libraries/libpack` with all components from design-c: utility functions,
`PackStager`, `TarEmitter`, `GitEmitter`, `DiscEmitter`, `PackBuilder`, and
tests. Purely additive — no modifications to existing Pathway files.

## Files

| Action | Path                                        |
| ------ | ------------------------------------------- |
| Create | `libraries/libpack/package.json`            |
| Create | `libraries/libpack/src/index.js`            |
| Create | `libraries/libpack/src/util.js`             |
| Create | `libraries/libpack/src/stager.js`           |
| Create | `libraries/libpack/src/tar-emitter.js`      |
| Create | `libraries/libpack/src/git-emitter.js`      |
| Create | `libraries/libpack/src/disc-emitter.js`     |
| Create | `libraries/libpack/src/builder.js`          |
| Create | `libraries/libpack/test/util.test.js`       |
| Create | `libraries/libpack/test/stager.test.js`     |
| Create | `libraries/libpack/test/tar-emitter.test.js`|
| Create | `libraries/libpack/test/git-emitter.test.js`|
| Create | `libraries/libpack/test/disc-emitter.test.js`|
| Create | `libraries/libpack/test/builder.test.js`    |

## Ordering

Steps 1–2 first (scaffold + utils). Steps 3–6 (stager + emitters) depend on
Step 2 (imports from `util.js`). Step 7 (builder) depends on 3–6. Step 8 (tests)
can be written alongside each component but verified last.

---

### Step 1: Package scaffold

Register libpack in the Bun workspace.

**Create** `libraries/libpack/package.json`:

```json
{
  "name": "@forwardimpact/libpack",
  "version": "0.1.0",
  "description": "Pack distribution — tarballs, bare git repos, and skill discovery indices",
  "keywords": ["pack", "distribution", "git", "tarball", "agent"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "libraries/libpack"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Platform Builders",
      "goal": "Integrate with the Engineering Standard",
      "trigger": "Needing engineers to install skill packs and realizing each ecosystem expects a different artifact format.",
      "bigHire": "distribute skill packs so agents and engineers can install them through their preferred tool.",
      "littleHire": "add a distribution format without reimplementing the staging and orchestration loop.",
      "competesWith": "inlining pack logic in each product command; hand-rolling tar and git plumbing per consumer; maintaining parallel format-specific scripts"
    }
  ],
  "type": "module",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "files": ["src/**/*.js"],
  "engines": {
    "bun": ">=1.2.0",
    "node": ">=18.0.0"
  },
  "scripts": {
    "test": "bun test test/*.test.js"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

No runtime dependencies — only Node built-ins (`fs`, `child_process`, `path`).

**Create** `libraries/libpack/src/index.js`:

```javascript
export { PackBuilder } from "./builder.js";
export { PackStager } from "./stager.js";
export { TarEmitter } from "./tar-emitter.js";
export { GitEmitter } from "./git-emitter.js";
export { DiscEmitter } from "./disc-emitter.js";
```

**Verify:** `bun install` succeeds; `import("@forwardimpact/libpack")` resolves.

---

### Step 2: Utility functions

Move shared helpers out of `build-packs.js` and `build-packs-apm.js`.

**Create** `libraries/libpack/src/util.js` with these exports:

| Function            | Origin                              | Purpose                                          |
| ------------------- | ----------------------------------- | ------------------------------------------------ |
| `collectPaths`      | `build-packs.js` `collectPaths`     | Recursively collect all paths (files + dirs), relative to root, for tar |
| `resetTimestamps`   | `build-packs.js` `resetTimestamps`  | Set mtime/atime to Unix epoch for all entries    |
| `stringifySorted`   | `build-packs.js` `stringifySorted`  | `JSON.stringify` with recursively sorted keys    |
| `collectFiles`      | `build-packs.js` `collectFileList` (renamed) | Files only (no dirs), sorted — for skill manifests. Consolidates `collectFileList` from `build-packs.js` and `collectFiles` from `build-packs-apm.js` (identical behavior) |
| `parseFrontmatter`  | `build-packs.js` `parseFrontmatter` | Parse YAML frontmatter from `SKILL.md`           |
| `buildSkillEntry`   | `build-packs.js` `buildSkillEntry`  | Build `{name, description, files}` from a skill dir |

All functions are pure or I/O-only — no libskill or Pathway imports.

**Verify:** `bun test test/util.test.js` — round-trip `stringifySorted` (key
ordering), `parseFrontmatter` (valid and missing frontmatter).

---

### Step 3: PackStager

Stage directory trees per layout (full, APM, skills).

**Create** `libraries/libpack/src/stager.js`:

```javascript
export class PackStager {
  /**
   * Stage the full pack layout.
   * @param {string} dir — output directory
   * @param {Object} content
   *   agents:           [{ filename: string, content: string }]
   *   skills:           [{ dirname: string, files: [{ path, content, mode? }] }]
   *   teamInstructions: string | null
   *   claudeSettings:   object | null
   *   vscodeSettings:   object | null
   */
  async stageFull(dir, content)

  /**
   * Stage the APM bundle from a full staging dir.
   * @param {string} fullDir — path to a staged full pack
   * @param {string} apmDir — output directory
   * @param {string} packName
   * @param {string} version
   */
  async stageApm(fullDir, apmDir, packName, version)

  /**
   * Return the skills subdirectory of a full staging dir.
   */
  skillsDir(fullDir)
}
```

`stageFull` writes:

| Path                               | Source                  |
| ---------------------------------- | ----------------------- |
| `.claude/agents/{filename}`        | `content.agents[].content` |
| `.claude/skills/{dirname}/{path}`  | `content.skills[].files[]` (respects `mode`). The `files` array includes `SKILL.md`, optional `scripts/install.sh`, and `references/{name}.md` entries — all pre-formatted by the caller |
| `.claude/CLAUDE.md`                | `content.teamInstructions` (if non-null) |
| `.claude/settings.json`            | `JSON.stringify(content.claudeSettings)` |
| `.vscode/settings.json`            | `JSON.stringify(content.vscodeSettings)` (if non-empty) |

Logic moves from `build-packs.js` `writePackFiles` (lines 93–176). The key
difference: `writePackFiles` calls Pathway formatters; `stageFull` receives
pre-formatted strings.

`stageApm` moves from `build-packs-apm.js` `stageApmBundle` (lines 54–132).
Reads from `fullDir/.claude/` — copies `.claude/skills/`, `.claude/agents/`,
`.claude/CLAUDE.md` (if present). Intentionally excludes `.claude/settings.json`
and `.vscode/` (no APM primitive for these). Generates `apm.lock.yaml` with
epoch timestamp and sorted deployed file list.

`skillsDir` returns `join(fullDir, ".claude", "skills")`.

**Verify:** `bun test test/stager.test.js` — stage a minimal combination (one
agent, one skill with reference, team instructions, settings). Assert file tree
matches expected layout. Stage APM from it, verify lock file structure and file
subset.

---

### Step 4: TarEmitter

Deterministic tarball from any staged directory.

**Create** `libraries/libpack/src/tar-emitter.js`:

```javascript
import { writeFile } from "fs/promises";
import { execFileSync } from "child_process";
import { collectPaths, resetTimestamps } from "./util.js";

export class TarEmitter {
  #exec;
  constructor({ exec = execFileSync } = {}) {
    this.#exec = exec;
  }

  async emit(stagedDir, outputPath) {
    await resetTimestamps(stagedDir);
    const files = await collectPaths(stagedDir);
    files.sort();
    const tarBuf = this.#exec("tar", [
      "--no-recursion", "-cf", "-", "-C", stagedDir, ...files,
    ]);
    const gzBuf = this.#exec("gzip", ["-n"], { input: tarBuf });
    await writeFile(outputPath, gzBuf);
  }
}
```

Logic moves from `build-packs.js` `archiveRawPack` (lines 271–287) and
`build-packs-apm.js` `archiveApmPack` (lines 143–157) — both are identical.

**Verify:** `bun test test/tar-emitter.test.js` — emit a tarball from a temp
dir with known files; verify `tar tzf` lists expected paths; two calls produce
byte-identical output.

---

### Step 5: GitEmitter

Static bare git repo from any staged directory + version.

**Create** `libraries/libpack/src/git-emitter.js`:

```javascript
import { readdir, readFile, stat, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { execFileSync } from "child_process";

const AUTHOR = "Forward Impact Pathway";
const EMAIL = "pathway@forwardimpact.team";
const EPOCH = "1970-01-01T00:00:00Z";

export class GitEmitter {
  #exec;
  constructor({ exec = execFileSync } = {}) {
    this.#exec = exec;
  }

  async emit(stagedDir, outputPath, { version, name }) { ... }
}
```

`emit` implementation sequence:

| #  | Command / action                                               | Purpose                              |
| -- | -------------------------------------------------------------- | ------------------------------------ |
| 1  | `git init --bare --initial-branch=main <outputPath>`           | Scaffold bare repo                   |
| 2  | For each file in `stagedDir` (recursive, sorted): `git hash-object -w --stdin` | Create blob objects     |
| 3  | Check `stat().mode & 0o111` per file                           | Detect executable bit → `100755` or `100644` |
| 4  | Build tree entries bottom-up, pipe to `git mktree`             | Create tree objects for each dir level |
| 5  | `git commit-tree <rootTree> -m "pathway v{version}\n"`         | Create commit (env vars pin author/date) |
| 6  | `git update-ref refs/heads/main <commitSha>`                   | Point default branch at commit       |
| 7  | `git update-ref refs/tags/v{version} <commitSha>`              | Lightweight tag                      |
| 8  | `git repack -a -d --no-reuse-delta`                            | Single deterministic packfile        |
| 9  | `git prune-packed`                                             | Remove loose objects                 |
| 10 | `git update-server-info`                                       | Write `info/refs` + `objects/info/packs` |
| 11 | `git pack-refs --all`                                          | Write `packed-refs`                  |
| 12 | Overwrite `config` with minimal bare config                    | Deterministic config content         |
| 13 | Write `description` → `Pathway pack: {name}\n`                 | Human-readable repo description      |
| 14 | Remove `hooks/`, `info/exclude`, empty `refs/` tree            | Strip to design-specified files only |

All `git` commands share a `#gitEnv` object built once in `emit` and stored as
an instance field for `#hashTree` to access:

```javascript
this.#gitEnv = {
  ...process.env,
  GIT_DIR: outputPath,
  GIT_AUTHOR_NAME: AUTHOR,
  GIT_AUTHOR_EMAIL: EMAIL,
  GIT_AUTHOR_DATE: EPOCH,
  GIT_COMMITTER_NAME: AUTHOR,
  GIT_COMMITTER_EMAIL: EMAIL,
  GIT_COMMITTER_DATE: EPOCH,
};
```

The recursive tree-building helper:

```javascript
async #hashTree(stagedDir) {
  const entries = await readdir(stagedDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const lines = [];
  for (const entry of entries) {
    const fullPath = join(stagedDir, entry.name);
    if (entry.isDirectory()) {
      const treeSha = await this.#hashTree(fullPath);
      lines.push(`040000 tree ${treeSha}\t${entry.name}`);
    } else {
      const blobSha = this.#exec("git", ["hash-object", "-w", "--stdin"],
        { input: await readFile(fullPath), env: this.#gitEnv }).toString().trim();
      const mode = (await stat(fullPath)).mode & 0o111 ? "100755" : "100644";
      lines.push(`${mode} blob ${blobSha}\t${entry.name}`);
    }
  }
  return this.#exec("git", ["mktree"],
    { input: lines.join("\n") + "\n", env: this.#gitEnv }).toString().trim();
}
```

Minimal bare config (written in step 12):

```
[core]
	repositoryformatversion = 0
	filemode = true
	bare = true
```

After cleanup (step 14), the output contains exactly:

| Path                               | Content                                 |
| ---------------------------------- | --------------------------------------- |
| `HEAD`                             | `ref: refs/heads/main\n`               |
| `config`                           | Minimal bare config above               |
| `description`                      | `Pathway pack: {name}\n`               |
| `info/refs`                        | Sorted refs from `update-server-info`   |
| `objects/info/packs`               | `P pack-<sha>.pack\n`                  |
| `objects/pack/pack-<sha>.pack`     | All objects in one pack                 |
| `objects/pack/pack-<sha>.idx`      | Matching index                          |
| `packed-refs`                      | Header + sorted ref lines               |

**Verify:** `bun test test/git-emitter.test.js`:

- Emit a repo from a temp dir with known files (including one executable)
- `git clone <outputPath>` into a temp dir succeeds; working tree matches input
- `git ls-remote --tags <outputPath>` lists `v{version}`
- Only the 8 expected paths exist (no `hooks/`, no loose objects)
- Two calls with identical input produce byte-identical output (compare every
  file)
- Serve via `node:http` static handler + `git clone http://localhost:PORT/`
  succeeds (dumb-HTTP integration)

---

### Step 6: DiscEmitter

Copy staged skills tree to `.well-known/skills/` with discovery index.

**Create** `libraries/libpack/src/disc-emitter.js`:

```javascript
import { mkdir, readdir, cp, writeFile } from "fs/promises";
import { join } from "path";
import { buildSkillEntry, stringifySorted } from "./util.js";

const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

export class DiscEmitter {
  async emit(skillsSrcDir, outputPath) { ... }
  async emitAggregate(packsOutputDir, allPackEntries) { ... }
}
```

`emit(skillsSrcDir, outputPath)`:

1. Create `<outputPath>/.well-known/skills/`
2. Read skill subdirectories from `skillsSrcDir` (sorted)
3. Copy each to `<outputPath>/.well-known/skills/{name}/`
4. Build entry per skill via `buildSkillEntry`
5. Write `index.json` via `stringifySorted`
6. Return entries array (for aggregate use)

Logic moves from `build-packs.js` `writeSkillsPack` (lines 356–385).

`emitAggregate(packsOutputDir, allPackEntries)`:

1. Deduplicate entries by skill name (first occurrence wins)
2. Copy skill dirs from source pack's `.well-known/skills/`
3. Write aggregate `index.json`

Logic moves from `build-packs.js` `writeSkillsAggregate` (lines 398–434).

`allPackEntries` shape: `[{ packName: string, entries: Array }]`.

**Verify:** `bun test test/disc-emitter.test.js` — emit from a staged skills
dir with two skills; verify `index.json` has correct `$schema`, sorted entries,
and each skill file exists under `.well-known/skills/`.

---

### Step 7: PackBuilder

Orchestrate: loop combinations, compose stager + emitters.

**Create** `libraries/libpack/src/builder.js`:

```javascript
import { mkdir, rm } from "fs/promises";
import { join } from "path";

export class PackBuilder {
  #stager;
  #emitters;

  constructor({ stager, emitters }) {
    this.#stager = stager;
    this.#emitters = emitters; // { tar: TarEmitter, git: GitEmitter, disc: DiscEmitter }
  }

  async build({ combinations, outputDir, version }) { ... }
}
```

All paths in the orchestration table below are relative to `outputDir`.
`_packs/` is a temporary staging directory created and cleaned up by `build`;
`packs/` is the final output directory containing published artifacts.

`combinations` shape:

```javascript
[{
  name: "se-platform",
  description: "Software Engineering (Platform) — agent team",
  content: { agents, skills, teamInstructions, claudeSettings, vscodeSettings },
}]
```

`build` orchestration per combination:

| #  | Action                                                       | Output path                            |
| -- | ------------------------------------------------------------ | -------------------------------------- |
| 1  | `stager.stageFull(fullDir, content)`                         | `_packs/{name}`                        |
| 2  | `stager.stageApm(fullDir, apmDir, name, version)`            | `_packs/{name}-apm`                    |
| 3  | `emitters.tar.emit(fullDir, ...)`                            | `packs/{name}.raw.tar.gz`              |
| 4  | `emitters.tar.emit(apmDir, ...)`                             | `packs/{name}.apm.tar.gz`              |
| 5  | `emitters.git.emit(apmDir, ..., {version, name})`            | `packs/{name}.apm.git/`               |
| 6  | `emitters.disc.emit(stager.skillsDir(fullDir), ...)`         | `packs/{name}/`                        |
| 7  | `emitters.git.emit(stager.skillsDir(fullDir), ..., {version, name})` | `packs/{name}.skills.git/` |

After all combinations:

| #  | Action                                                       | Output path                            |
| -- | ------------------------------------------------------------ | -------------------------------------- |
| 8  | `emitters.disc.emitAggregate(packsDir, allPackEntries)`      | `packs/.well-known/skills/`            |
| 9  | `rm(_packs/, {recursive: true})`                             | Clean staging                          |

Returns: `{ packs: [{ name, description }] }`.

Pathway's glue uses the returned list to write `apm.yml` (a Pathway-specific
manifest format that stays in Pathway).

**Verify:** `bun test test/builder.test.js` — inject mock emitters (recording
stubs), call `build` with two combinations. Assert:

- `stageFull` called twice with correct content
- `stageApm` called twice
- `tar.emit` called four times (2 raw + 2 APM)
- `git.emit` called four times (2 APM + 2 skills)
- `disc.emit` called twice (per-pack) + once (`emitAggregate`)
- Staging dir cleaned up
- Return value has correct pack list

---

### Step 8: Verification

Run the full libpack test suite.

```sh
cd libraries/libpack && bun test
```

All tests from steps 2–7 pass. The git-emitter integration test (dumb-HTTP
clone) requires system `git` — skip in environments where git is unavailable.

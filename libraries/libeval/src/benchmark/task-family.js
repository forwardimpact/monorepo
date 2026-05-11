/**
 * Task-family loader (spec 870 plan-a Step 2).
 *
 * Resolves a family root from a local path or a git URL, walks the
 * `tasks/<task_family_name>/<task_name>/` tree, and produces a `TaskFamily`
 * object whose `tasks()` iterator yields `Task` records with absolute paths
 * to the family-shipped files.
 *
 * Computes `familyRevision`:
 *   - `git:<sha>` when sourced from a git URL (HEAD at clone time).
 *   - `sha256:<hex>` for local paths, via the canonical-tree algorithm in
 *     design § Family revision algorithm: sorted root-relative POSIX paths
 *     (NFC-normalised UTF-8), per-file sha256, concatenated with
 *     `<rel-path>\0<hex-sha>\n` rows, sha256 of the concatenation.
 *
 * Also loads `<root>/apm.lock.yaml` bytes (LF-normalised) — the fingerprint
 * `skillSetHash` is derived from these bytes by `apm-installer.js`.
 */

import {
  readFileSync,
  statSync,
  readdirSync,
  mkdtempSync,
  accessSync,
  constants as fsConstants,
} from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const EXCLUDED_DIRS = new Set([".git", "node_modules"]);

function isGitUrl(s) {
  return (
    s.startsWith("git@") ||
    s.startsWith("git://") ||
    s.startsWith("ssh://") ||
    s.startsWith("https://") ||
    s.startsWith("http://")
  );
}

function cloneGitFamily(url) {
  const dest = mkdtempSync(join(tmpdir(), "fit-benchmark-family-"));
  execSync(
    `git clone --depth 1 --quiet ${JSON.stringify(url)} ${JSON.stringify(dest)}`,
  );
  const sha = execSync(`git -C ${JSON.stringify(dest)} rev-parse HEAD`, {
    encoding: "utf8",
  }).trim();
  return { rootPath: dest, familyRevision: `git:${sha}` };
}

function listFilesRecursive(root) {
  const out = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      // Treat regular files and symlinks the same — both yield content via
      // readFileSync (symlinks are resolved to their target by the OS).
      out.push(join(dir, entry.name));
    }
  }
  walk(root);
  return out;
}

function toPosixRelative(root, abs) {
  const r = relative(root, abs);
  // Normalise path separators so Windows and POSIX produce byte-identical
  // sorts and row strings. NFC normalises composed/decomposed unicode.
  return r.split(sep).join("/").normalize("NFC");
}

function computeFamilyRevisionSha(rootPath) {
  const files = listFilesRecursive(rootPath);
  const rows = files
    .map((abs) => ({ rel: toPosixRelative(rootPath, abs), abs }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map(({ rel, abs }) => {
      const fileSha = createHash("sha256")
        .update(readFileSync(abs))
        .digest("hex");
      return `${rel}\0${fileSha}\n`;
    });
  const concat = rows.join("");
  const final = createHash("sha256").update(concat, "utf8").digest("hex");
  return `sha256:${final}`;
}

function readApmLockBytes(rootPath) {
  const lockPath = join(rootPath, "apm.lock.yaml");
  const raw = readFileSync(lockPath);
  // LF normalisation — strip CR so Windows checkouts and POSIX checkouts
  // produce the same `skillSetHash` (design Decision 4).
  return Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

function loadTasks(rootPath) {
  const tasksDir = join(rootPath, "tasks");
  let familyDirs;
  try {
    familyDirs = readdirSync(tasksDir, { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    );
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const tasks = [];
  for (const familyDir of familyDirs) {
    const taskFamilyName = familyDir.name;
    const taskFamilyPath = join(tasksDir, taskFamilyName);
    const taskDirs = readdirSync(taskFamilyPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const taskName of taskDirs) {
      const taskRoot = join(taskFamilyPath, taskName);
      tasks.push({
        id: `${taskFamilyName}/${taskName}`,
        paths: {
          instructions: join(taskRoot, "instructions.md"),
          supervisor: join(taskRoot, "supervisor.task.md"),
          judge: join(taskRoot, "judge.task.md"),
          specs: join(taskRoot, "specs"),
          workdir: join(taskRoot, "workdir"),
          scoring: join(taskRoot, "scoring"),
        },
      });
    }
  }
  return tasks;
}

/**
 * @typedef {{
 *   id: string,
 *   paths: {
 *     instructions: string, supervisor: string, judge: string,
 *     specs: string, workdir: string, scoring: string,
 *   }
 * }} Task
 *
 * @typedef {{
 *   rootPath: string,
 *   familyRevision: string,
 *   apmLockBytes: Buffer,
 *   tasks: () => Iterable<Task>,
 * }} TaskFamily
 */

/**
 * Load a task family from a local path or git URL.
 * @param {string} rootPathOrGitUrl
 * @returns {Promise<TaskFamily>}
 */
export async function loadTaskFamily(rootPathOrGitUrl) {
  let rootPath;
  let familyRevision;
  if (isGitUrl(rootPathOrGitUrl)) {
    const cloned = cloneGitFamily(rootPathOrGitUrl);
    rootPath = cloned.rootPath;
    familyRevision = cloned.familyRevision;
  } else {
    rootPath = resolve(rootPathOrGitUrl);
    const s = statSync(rootPath);
    if (!s.isDirectory()) {
      throw new Error(`Family root is not a directory: ${rootPath}`);
    }
    familyRevision = computeFamilyRevisionSha(rootPath);
  }

  const apmLockBytes = readApmLockBytes(rootPath);
  const tasks = loadTasks(rootPath);

  return {
    rootPath,
    familyRevision,
    apmLockBytes,
    tasks: () => tasks[Symbol.iterator](),
  };
}

/**
 * Assert that `<stagingDir>/.claude/agents/<judgeProfile>.md` exists. Called
 * by the `BenchmarkRunner` install gate when `--judge-profile` is supplied —
 * `createSupervisor` resolves `profilesDir = <supervisorCwd>/.claude/agents`
 * (supervisor.js:511), and the staging tree is what gets copied into the
 * supervisor's cwd, so the file must be present in the family's pre-staged
 * `.claude/agents/`.
 * @param {TaskFamily} _family
 * @param {string} stagingDir
 * @param {string} judgeProfile
 * @returns {Promise<void>}
 */
export async function assertJudgeProfileStaged(
  _family,
  stagingDir,
  judgeProfile,
) {
  const profilePath = join(
    stagingDir,
    ".claude",
    "agents",
    `${judgeProfile}.md`,
  );
  try {
    accessSync(profilePath, fsConstants.R_OK);
  } catch {
    throw new Error(
      `Judge profile not staged: expected ${profilePath} to exist (--judge-profile=${judgeProfile})`,
    );
  }
}

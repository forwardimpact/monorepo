/**
 * Task-family loader. A task family is a directory under
 *   <root>/
 *     apm.lock.yaml
 *     .claude/                # pre-staged skills + agents
 *     tasks/<task_name>/
 *       agent.task.md
 *       supervisor.task.md    # optional; appended to the task as supervisor context
 *       judge.task.md
 *       hooks/                # harness-only; never copied to agent CWD
 *         preflight.sh
 *         invariants.sh
 *       tests/                # optional hidden test suite; harness-only overlay
 *       specs/                # copied into agent CWD
 *       workdir/              # copied into agent CWD
 *
 * `tests/` is an overlay mirror of the agent CWD: a file's path under
 * `tests/` is its staging path. Every `*.test.js` file is one check —
 * `*.gate.test.js` marks a gate, any other `*.test.js` is scored — and every
 * other file is support material, staged but never graded. The layout is
 * validated eagerly here so authoring errors fail before any agent spend.
 *
 * Local paths or git URLs are both accepted; git URLs are shallow-cloned into
 * a temp dir and `familyRevision` becomes `git:<sha>` of HEAD at clone time.
 * Local paths use the canonical-tree algorithm from design § Family revision
 * algorithm so the result is stable across operating systems.
 *
 * Filesystem and subprocess access route through the injected `runtime` bag
 * (`runtime.fs` async, `runtime.subprocess.run` one-shot, `tmpdir` derived
 * from `runtime.proc.env`).
 */

import { createHash } from "node:crypto";
import { join, posix, relative, resolve, sep } from "node:path";

const GIT_URL_RE = /^(git@|https?:\/\/|ssh:\/\/|git:\/\/)/;
const SKIP_DIRS = new Set([".git", "node_modules"]);
// POSIX `X_OK` (execute permission); node's fs honours the numeric mode, so we
// avoid importing `node:fs`'s `constants` (which would light the fs smell).
const X_OK = 1;

/**
 * Derive the system temp dir from the env (node's `os.tmpdir()` is itself an
 * env-respecting wrapper). The runtime bag has no `os` slot by design.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {string}
 */
function tmpdir(runtime) {
  return runtime.proc.env.TMPDIR ?? "/tmp";
}

/**
 * Load a task family from a local path or git URL.
 * @param {string} rootPathOrGitUrl
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<TaskFamily>}
 */
export async function loadTaskFamily(rootPathOrGitUrl, runtime) {
  if (!runtime) throw new Error("runtime is required");
  const isGit = GIT_URL_RE.test(rootPathOrGitUrl);
  let rootPath;
  let familyRevision;
  if (isGit) {
    const dir = await runtime.fs.mkdtemp(
      join(tmpdir(runtime), "fit-benchmark-family-"),
    );
    await gitClone(runtime, rootPathOrGitUrl, dir);
    rootPath = dir;
    familyRevision = "git:" + (await gitHead(runtime, dir));
  } else {
    rootPath = resolve(rootPathOrGitUrl);
    familyRevision = "sha256:" + (await canonicalTreeHash(runtime, rootPath));
  }

  const tasks = await discoverTasks(runtime, rootPath);

  return {
    rootPath,
    familyRevision,
    tasks() {
      return tasks;
    },
  };
}

/**
 * Assert that `<judgeProfilesDir>/<judgeProfile>.md` exists. Called from
 * `BenchmarkRunner.run()` so a missing judge profile fails the family
 * install before any agent session starts.
 * @param {TaskFamily} _family
 * @param {string} judgeProfilesDir
 * @param {string} judgeProfile
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<void>}
 */
export async function assertJudgeProfileStaged(
  _family,
  judgeProfilesDir,
  judgeProfile,
  runtime,
) {
  const candidate = join(judgeProfilesDir, `${judgeProfile}.md`);
  try {
    await runtime.fs.access(candidate);
  } catch {
    throw new Error(`judge profile not staged: ${candidate}`);
  }
}

async function discoverTasks(runtime, rootPath) {
  const fs = runtime.fs;
  const tasksRoot = join(rootPath, "tasks");
  const tasks = [];
  let entries;
  try {
    entries = await fs.readdir(tasksRoot, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return tasks;
    throw e;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    tasks.push(await loadTask(fs, join(tasksRoot, entry.name), entry.name));
  }
  tasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return tasks;
}

async function loadTask(fs, taskDir, id) {
  const supervisorPath = join(taskDir, "supervisor.task.md");
  const judgePath = join(taskDir, "judge.task.md");
  const preflightPath = join(taskDir, "hooks", "preflight.sh");
  const invariantsPath = join(taskDir, "hooks", "invariants.sh");
  const suite = await discoverSuite(fs, taskDir);
  return {
    id,
    paths: {
      taskDir,
      instructions: join(taskDir, "agent.task.md"),
      supervisor: (await fileExists(fs, supervisorPath))
        ? supervisorPath
        : null,
      judge: (await fileExists(fs, judgePath)) ? judgePath : null,
      hooks: join(taskDir, "hooks"),
      preflight: (await fileExecutable(fs, preflightPath))
        ? preflightPath
        : null,
      invariants: (await fileExecutable(fs, invariantsPath))
        ? invariantsPath
        : null,
      tests: suite ? join(taskDir, "tests") : null,
      specs: join(taskDir, "specs"),
      workdir: join(taskDir, "workdir"),
    },
    tests: suite,
  };
}

const CHECK_SUFFIX = ".test.js";
const GATE_SUFFIX = ".gate.test.js";

/**
 * Discover and validate a task's hidden test suite under `<taskDir>/tests/`.
 * Returns null when the directory is absent; throws on an invalid layout
 * (no check files, a dangling symlink, duplicate check names) so
 * `loadTaskFamily` rejects broken suites before any agent spend.
 * @param {object} fs - Async filesystem surface (`runtime.fs`).
 * @param {string} taskDir
 * @returns {Promise<HiddenSuite | null>}
 */
async function discoverSuite(fs, taskDir) {
  const testsRoot = join(taskDir, "tests");
  try {
    const st = await fs.lstat(testsRoot);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const files = [];
  await walkSuiteFiles(fs, testsRoot, testsRoot, files);
  files.sort((a, b) =>
    a.stagePath < b.stagePath ? -1 : a.stagePath > b.stagePath ? 1 : 0,
  );

  const checks = [];
  const support = [];
  for (const file of files) {
    const base = file.stagePath.split(sep).at(-1);
    if (!base.endsWith(CHECK_SUFFIX)) {
      support.push(file);
      continue;
    }
    const gate = base.endsWith(GATE_SUFFIX);
    const name = base.slice(0, -(gate ? GATE_SUFFIX : CHECK_SUFFIX).length);
    checks.push({ name, gate, ...file });
  }

  if (checks.length === 0) {
    throw new Error(`hidden test suite has no check files: ${testsRoot}`);
  }
  const seen = new Set();
  for (const check of checks) {
    if (seen.has(check.name)) {
      throw new Error(
        `hidden test suite has duplicate check name '${check.name}': ${check.sourcePath}`,
      );
    }
    seen.add(check.name);
  }
  return { checks, support };
}

/**
 * Walk a suite tree collecting `{sourcePath, stagePath}` entries. Unlike
 * `walkFiles` (which silently skips dangling symlinks for hashing), every
 * entry here must be a regular file after symlink resolution — a dangling
 * symlink or a link to a non-file target is an authoring error.
 */
async function walkSuiteFiles(fs, root, dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSuiteFiles(fs, root, full, out);
    } else if (entry.isFile()) {
      out.push({ sourcePath: full, stagePath: relative(root, full) });
    } else if (entry.isSymbolicLink()) {
      const resolved = await resolveSymlinkToFile(fs, full);
      if (!resolved) {
        throw new Error(
          `hidden test suite entry is not a regular file: ${full}`,
        );
      }
      out.push({ sourcePath: full, stagePath: relative(root, full) });
    } else {
      throw new Error(`hidden test suite entry is not a regular file: ${full}`);
    }
  }
}

async function fileExists(fs, path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileExecutable(fs, path) {
  try {
    await fs.access(path, X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical-tree hash per design § Family revision algorithm:
 *   list regular files (excluding .git/, node_modules/)
 *   resolve symlinks before reading
 *   sort by NFC-normalised POSIX-style root-relative path
 *   row = <rel-path>\0<hex-sha256>\n
 *   sha256(concat(rows))
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} rootPath
 * @returns {Promise<string>} hex digest
 */
async function canonicalTreeHash(runtime, rootPath) {
  const fs = runtime.fs;
  const real = await fs.realpath(rootPath);
  const rows = [];
  for await (const filePath of walkFiles(fs, real)) {
    const rel = toPosix(relative(real, filePath)).normalize("NFC");
    const target = await fs.realpath(filePath);
    const bytes = await fs.readFile(target);
    const hex = createHash("sha256").update(bytes).digest("hex");
    rows.push({ rel, hex });
  }
  rows.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const acc = createHash("sha256");
  for (const r of rows) acc.update(`${r.rel}\0${r.hex}\n`, "utf8");
  return acc.digest("hex");
}

async function* walkFiles(fs, dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkFiles(fs, full);
    } else if (entry.isSymbolicLink()) {
      const resolvedFile = await resolveSymlinkToFile(fs, full);
      if (resolvedFile) yield full;
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Return the resolved path if `linkPath` is a symlink to a regular file.
 * Returns null for dangling symlinks or links to non-file targets.
 */
async function resolveSymlinkToFile(fs, linkPath) {
  const st = await fs.lstat(linkPath);
  if (!st.isSymbolicLink()) return null;
  try {
    const resolved = await fs.realpath(linkPath);
    const tstat = await fs.lstat(resolved);
    return tstat.isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function toPosix(p) {
  if (sep === posix.sep) return p;
  return p.split(sep).join(posix.sep);
}

async function gitClone(runtime, url, dir) {
  await git(runtime, ["clone", "--depth", "1", url, dir]);
}

async function gitHead(runtime, dir) {
  const out = await git(runtime, ["-C", dir, "rev-parse", "HEAD"]);
  return out.trim();
}

async function git(runtime, args) {
  const { stdout, stderr, exitCode } = await runtime.subprocess.run(
    "git",
    args,
  );
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${exitCode}: ${stderr}`);
  }
  return stdout;
}

/**
 * @typedef {object} HiddenCheck
 * @property {string} name - Basename stem with the check suffix stripped.
 * @property {boolean} gate - True iff the filename ends `.gate.test.js`.
 * @property {string} sourcePath - Absolute path under `tests/`.
 * @property {string} stagePath - Path relative to `tests/` — the overlay
 *   mirror of the staging path under the agent CWD.
 */

/**
 * @typedef {object} HiddenSuite
 * @property {HiddenCheck[]} checks - In sorted stage-path order.
 * @property {{sourcePath: string, stagePath: string}[]} support - Non-check
 *   files, staged for the whole pass but never graded.
 */

/**
 * @typedef {object} Task
 * @property {string} id - Task name (directory name under tasks/)
 * @property {{taskDir: string, instructions: string, supervisor: string|null, judge: string|null, hooks: string, preflight: string|null, invariants: string|null, tests: string|null, specs: string, workdir: string}} paths
 * @property {HiddenSuite | null} tests - Hidden test suite (null when the
 *   task ships no `tests/` directory)
 */

/**
 * @typedef {object} TaskFamily
 * @property {string} rootPath
 * @property {string} familyRevision - `git:<sha>` or `sha256:<hex>`
 * @property {() => Task[]} tasks
 */

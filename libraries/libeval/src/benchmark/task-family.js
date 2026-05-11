/**
 * Task-family loader. A task family is a directory under
 *   <root>/
 *     apm.lock.yaml
 *     .claude/                # pre-staged skills + agents (P1)
 *     tasks/<task_family_name>/<task_name>/
 *       instructions.md
 *       supervisor.task.md    # preserved for v2; not read in v1
 *       judge.task.md
 *       specs/                # copied into agent CWD
 *       workdir/              # copied into agent CWD (excludes scripts/)
 *         scripts/preflight.sh
 *       scoring/              # template-only; never copied
 *
 * Local paths or git URLs are both accepted; git URLs are shallow-cloned into
 * a temp dir and `familyRevision` becomes `git:<sha>` of HEAD at clone time.
 * Local paths use the canonical-tree algorithm from design § Family revision
 * algorithm so the result is stable across operating systems.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, relative, resolve, sep } from "node:path";

const GIT_URL_RE = /^(git@|https?:\/\/|ssh:\/\/|git:\/\/)/;
const SKIP_DIRS = new Set([".git", "node_modules"]);

/**
 * Load a task family from a local path or git URL.
 * @param {string} rootPathOrGitUrl
 * @returns {Promise<TaskFamily>}
 */
export async function loadTaskFamily(rootPathOrGitUrl) {
  const isGit = GIT_URL_RE.test(rootPathOrGitUrl);
  let rootPath;
  let familyRevision;
  if (isGit) {
    const dir = await mkdtemp(join(tmpdir(), "fit-benchmark-family-"));
    await gitClone(rootPathOrGitUrl, dir);
    rootPath = dir;
    familyRevision = "git:" + (await gitHead(dir));
  } else {
    rootPath = resolve(rootPathOrGitUrl);
    familyRevision = "sha256:" + (await canonicalTreeHash(rootPath));
  }

  const apmLockBytes = await readApmLockBytes(rootPath);
  const tasks = await discoverTasks(rootPath);

  return {
    rootPath,
    familyRevision,
    apmLockBytes,
    tasks() {
      return tasks;
    },
  };
}

/**
 * Assert that `<stagingDir>/.claude/agents/<judgeProfile>.md` exists. Called
 * from `BenchmarkRunner.run()` so a missing judge profile fails the family
 * install before any agent session starts.
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
  const candidate = join(stagingDir, ".claude", "agents", `${judgeProfile}.md`);
  try {
    await access(candidate);
  } catch {
    throw new Error(
      `judge profile not staged: ${candidate} (createSupervisor resolves profiles relative to <supervisorCwd>/.claude/agents)`,
    );
  }
}

async function readApmLockBytes(rootPath) {
  const lockPath = join(rootPath, "apm.lock.yaml");
  try {
    const raw = await readFile(lockPath);
    return normalizeLf(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        `task family missing apm.lock.yaml at ${lockPath} (matches libpack stager.js:126; .yml is not accepted)`,
      );
    }
    throw e;
  }
}

/**
 * Replace CRLF with LF so cross-OS authored lockfiles hash identically.
 * @param {Buffer} buf
 * @returns {Buffer}
 */
function normalizeLf(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) continue;
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

async function discoverTasks(rootPath) {
  const tasksRoot = join(rootPath, "tasks");
  const tasks = [];
  let families;
  try {
    families = await readdir(tasksRoot, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return tasks;
    throw e;
  }
  for (const family of families) {
    if (!family.isDirectory()) continue;
    const familyDir = join(tasksRoot, family.name);
    const entries = await readdir(familyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const taskDir = join(familyDir, entry.name);
      tasks.push({
        id: `${family.name}/${entry.name}`,
        paths: {
          instructions: join(taskDir, "instructions.md"),
          supervisor: join(taskDir, "supervisor.task.md"),
          judge: join(taskDir, "judge.task.md"),
          specs: join(taskDir, "specs"),
          workdir: join(taskDir, "workdir"),
          scoring: join(taskDir, "scoring"),
        },
      });
    }
  }
  tasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return tasks;
}

/**
 * Canonical-tree hash per design § Family revision algorithm:
 *   list regular files (excluding .git/, node_modules/)
 *   resolve symlinks before reading
 *   sort by NFC-normalised POSIX-style root-relative path
 *   row = <rel-path>\0<hex-sha256>\n
 *   sha256(concat(rows))
 * @param {string} rootPath
 * @returns {Promise<string>} hex digest
 */
async function canonicalTreeHash(rootPath) {
  const real = await realpath(rootPath);
  const rows = [];
  for await (const filePath of walkFiles(real)) {
    const rel = toPosix(relative(real, filePath)).normalize("NFC");
    const target = await realpath(filePath);
    const bytes = await readFile(target);
    const hex = createHash("sha256").update(bytes).digest("hex");
    rows.push({ rel, hex });
  }
  rows.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const acc = createHash("sha256");
  for (const r of rows) acc.update(`${r.rel}\0${r.hex}\n`, "utf8");
  return acc.digest("hex");
}

async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkFiles(full);
    } else if (entry.isSymbolicLink()) {
      const resolvedFile = await resolveSymlinkToFile(full);
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
async function resolveSymlinkToFile(linkPath) {
  const st = await lstat(linkPath);
  if (!st.isSymbolicLink()) return null;
  try {
    const resolved = await realpath(linkPath);
    const tstat = await lstat(resolved);
    return tstat.isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function toPosix(p) {
  if (sep === posix.sep) return p;
  return p.split(sep).join(posix.sep);
}

async function gitClone(url, dir) {
  await run("git", ["clone", "--depth", "1", url, dir]);
}

async function gitHead(dir) {
  const out = await run("git", ["-C", dir, "rev-parse", "HEAD"]);
  return out.trim();
}

function run(cmd, args) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", rej);
    child.on("close", (code) => {
      if (code === 0) res(stdout);
      else rej(new Error(`${cmd} ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}

/**
 * @typedef {object} Task
 * @property {string} id - METR-style "task_family_name/task_name"
 * @property {{instructions: string, supervisor: string, judge: string, specs: string, workdir: string, scoring: string}} paths
 */

/**
 * @typedef {object} TaskFamily
 * @property {string} rootPath
 * @property {string} familyRevision - `git:<sha>` or `sha256:<hex>`
 * @property {Buffer} apmLockBytes - LF-normalised
 * @property {() => Task[]} tasks
 */

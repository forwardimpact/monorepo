/**
 * Thin wrapper around `git log` / `git show` for trajectory parsing.
 *
 * All calls shell out through an injected collaborator: production passes
 * `runtime.subprocess` (via `options.subprocess`); tests inject a promisified
 * `exec` fake (via `options.exec`) to drive the helpers without a real git
 * binary. Either seam keeps these functions free of an ambient
 * `node:child_process` import.
 */

/** Signals that git history operations failed because git is missing or the working directory is not a repository. */
export class GitUnavailableError extends Error {
  /** Create a GitUnavailableError with the underlying failure reason. */
  constructor(reason) {
    super(
      `Git history not available: ${reason}. Install git or track summit.yaml in version control.`,
    );
    this.code = "SUMMIT_GIT_UNAVAILABLE";
  }
}

/**
 * Resolve the exec adapter: prefer an explicit test `exec`, else build one over
 * the injected `subprocess` collaborator.
 * @param {object} options - `{ exec?, subprocess? }`.
 * @returns {(cmd: string, args: string[], opts: object) => Promise<{stdout: string, stderr: string}>}
 */
function resolveExec(options) {
  if (options.exec) return options.exec;
  const subprocess = options.subprocess;
  if (!subprocess) {
    throw new GitUnavailableError(
      "no subprocess collaborator provided to git history helpers",
    );
  }
  return async (cmd, args, opts) => {
    const r = await subprocess.run(cmd, args, opts);
    if (r.exitCode !== 0) {
      const err = new Error(
        (r.stderr ?? "").trim() || `${cmd} exited with ${r.exitCode}`,
      );
      if (r.exitCode === 127) err.code = "ENOENT";
      throw err;
    }
    return { stdout: r.stdout, stderr: r.stderr };
  };
}

/**
 * @typedef {object} CommitRecord
 * @property {string} sha
 * @property {Date} date
 */

/**
 * Return the absolute path of the git repository root that contains
 * `cwd`. Used to convert a caller-supplied path into a repo-root-relative
 * path before shelling out to `git show <sha>:<path>`, which interprets
 * its path argument as repo-root-relative regardless of `cwd`.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {Function} [options.exec] - Test exec override.
 * @param {object} [options.subprocess] - `runtime.subprocess` collaborator.
 * @returns {Promise<string>}
 */
export async function getRepoRoot(options = {}) {
  const exec = resolveExec(options);
  const cwd = options.cwd;
  try {
    const result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
    return (result.stdout ?? "").trim();
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new GitUnavailableError("git binary not found");
    }
    throw new GitUnavailableError(e.message ?? "git rev-parse failed");
  }
}

/**
 * List commits that modified the given file, newest first.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {Function} [options.exec] - Test exec override.
 * @param {object} [options.subprocess] - `runtime.subprocess` collaborator.
 * @returns {Promise<CommitRecord[]>}
 */
export async function listCommits(filePath, options = {}) {
  const exec = resolveExec(options);
  const cwd = options.cwd;
  let result;
  try {
    result = await exec(
      "git",
      ["log", "--follow", "--format=%H %cI", "--", filePath],
      { cwd },
    );
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new GitUnavailableError("git binary not found");
    }
    throw new GitUnavailableError(e.message ?? "git log failed");
  }
  const stdout = result.stdout ?? "";
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, iso] = line.split(/\s+/, 2);
      return { sha, date: new Date(iso) };
    });
}

/**
 * Return the contents of `filePath` at `sha`.
 *
 * @param {string} sha
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {Function} [options.exec] - Test exec override.
 * @param {object} [options.subprocess] - `runtime.subprocess` collaborator.
 * @returns {Promise<string>}
 */
export async function showFileAt(sha, filePath, options = {}) {
  const exec = resolveExec(options);
  const cwd = options.cwd;
  let result;
  try {
    result = await exec("git", ["show", `${sha}:${filePath}`], { cwd });
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new GitUnavailableError("git binary not found");
    }
    throw new GitUnavailableError(e.message ?? "git show failed");
  }
  return result.stdout ?? "";
}

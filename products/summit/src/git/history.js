/**
 * Thin wrapper around `git log` / `git show` for trajectory parsing.
 *
 * All calls shell out via `execFile` — DI through the optional `exec`
 * parameter lets tests drive the helpers without a real git binary.
 */

import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const defaultExec = promisify(_execFile);

export class GitUnavailableError extends Error {
  constructor(reason) {
    super(
      `Git history not available: ${reason}. Install git or track summit.yaml in version control.`,
    );
    this.code = "SUMMIT_GIT_UNAVAILABLE";
  }
}

/**
 * @typedef {object} CommitRecord
 * @property {string} sha
 * @property {Date} date
 */

/**
 * List commits that modified the given file, newest first.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {typeof defaultExec} [options.exec]
 * @returns {Promise<CommitRecord[]>}
 */
export async function listCommits(filePath, options = {}) {
  const exec = options.exec ?? defaultExec;
  const cwd = options.cwd ?? process.cwd();
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
 * @returns {Promise<string>}
 */
export async function showFileAt(sha, filePath, options = {}) {
  const exec = options.exec ?? defaultExec;
  const cwd = options.cwd ?? process.cwd();
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

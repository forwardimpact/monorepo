/**
 * Safeguard-and-write logic behind the `gemba-selfedit` bin: write content
 * to a path that .claude/settings.json permits Edit on, while on a non-main
 * git branch. See libraries/libharness/README.md § gemba-selfedit for the
 * full rationale.
 */

import { resolve, relative, dirname } from "node:path";

import { minimatch } from "minimatch";

/** A safeguard violation — callers map it to exit code 2. */
export class SelfeditError extends Error {
  /** @param {string} message failure description */
  constructor(message) {
    super(message);
    this.name = "SelfeditError";
  }
}

/**
 * Check every safeguard for a selfedit write, then perform it.
 *
 * Safeguards (checked in order):
 * 1. The nearest .claude/settings.json must contain an Edit(<glob>) rule in
 *    permissions.allow[] that resolves to the target path.
 * 2. HEAD must not be detached and the current branch must not be 'main'.
 * 3. The target's parent directory must exist.
 *
 * @param {string} targetArg target path as given on the command line
 * @param {Buffer} content bytes to write
 * @param {{ runtime: object }} deps runtime bag (fsSync, proc, subprocess,
 *   finder); targetArg resolves against `runtime.proc.cwd()`
 * @returns {{ bytes: number, relativeTarget: string, matchedPattern: string,
 *   branch: string }} what was written and which rule allowed it
 * @throws {SelfeditError} on any safeguard violation
 */
export function runSelfeditCommand(targetArg, content, { runtime }) {
  const { fsSync, proc, subprocess, finder } = runtime;
  const cwd = proc.cwd();
  const absoluteTarget = resolve(cwd, targetArg);

  // Safeguard 1: settings.json must grant Edit() on this path. Resolve the
  // finder off the runtime bag rather than constructing a Finder here.
  const settingsPath = finder.findUpward(
    dirname(absoluteTarget),
    ".claude/settings.json",
    20,
  );
  if (!settingsPath) {
    throw new SelfeditError(
      `no .claude/settings.json found walking upward from ${dirname(absoluteTarget)}`,
    );
  }

  const projectRoot = dirname(dirname(settingsPath));
  const relativeTarget = relative(projectRoot, absoluteTarget);

  let settings;
  try {
    settings = JSON.parse(fsSync.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    throw new SelfeditError(`failed to parse ${settingsPath}: ${err.message}`);
  }

  const allowRules = settings?.permissions?.allow;
  if (!Array.isArray(allowRules)) {
    throw new SelfeditError(`${settingsPath} has no permissions.allow[] array`);
  }

  const editPatterns = allowRules
    .filter((rule) => typeof rule === "string")
    .map((rule) => rule.match(/^Edit\((.+)\)$/)?.[1])
    .filter(Boolean);

  if (editPatterns.length === 0) {
    throw new SelfeditError(
      `${settingsPath} has no Edit() rules in permissions.allow[]`,
    );
  }

  const matchedPattern = editPatterns.find((pattern) =>
    minimatch(relativeTarget, pattern, { dot: true }),
  );
  if (!matchedPattern) {
    throw new SelfeditError(
      `no Edit() rule in ${relative(projectRoot, settingsPath)} matches '${relativeTarget}' ` +
        `(tried: ${editPatterns.map((p) => `Edit(${p})`).join(", ")})`,
    );
  }

  // Safeguard 2: branch must not be main and HEAD must not be detached.
  const git = subprocess.runSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
  });
  if (git.exitCode !== 0) {
    throw new SelfeditError(
      "failed to read current git branch (not inside a git repository?)",
    );
  }
  const branch = git.stdout.trim();

  if (branch === "HEAD") {
    throw new SelfeditError(
      "HEAD is detached — refusing (check out a non-main branch first)",
    );
  }
  if (branch === "main") {
    throw new SelfeditError(
      "refusing to write while on branch 'main' — switch to a feature branch",
    );
  }

  const parent = dirname(absoluteTarget);
  if (!fsSync.existsSync(parent)) {
    throw new SelfeditError(
      `parent directory '${relative(projectRoot, parent)}' does not exist`,
    );
  }

  fsSync.writeFileSync(absoluteTarget, content);

  return { bytes: content.length, relativeTarget, matchedPattern, branch };
}

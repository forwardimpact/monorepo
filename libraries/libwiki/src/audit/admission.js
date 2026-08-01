import path from "node:path";

// Tracked-file enumerator for the admission scope. It yields the
// admission universe. That universe holds the wiki-relative paths the
// filename grammar governs.
//
// The enumerator walks the on-disk file tree under `wikiRoot`. It then
// intersects the walk with the git index when git state is present. Without
// git state (a fresh bootstrap or a test fixture), the universe is the whole
// walk. This keeps the rule's true positive (a *git-tracked* residue) in
// scope. It also excludes VCS internals and uncommitted scratch where a real
// repo exists.

/** Recursively collect file paths (wiki-relative, POSIX) under `dir`. */
function walk(absDir, wikiRoot, fs, out) {
  for (const name of fs.readdirSync(absDir)) {
    // The wiki's own VCS internals are never part of the grammar's universe.
    if (absDir === wikiRoot && name === ".git") continue;
    const abs = path.join(absDir, name);
    if (fs.statSync(abs).isDirectory()) {
      walk(abs, wikiRoot, fs, out);
    } else {
      out.push(path.relative(wikiRoot, abs).split(path.sep).join("/"));
    }
  }
}

/**
 * Read the git index at `wikiRoot` as a set of wiki-relative paths, or `null`
 * when there is no git state. There is no git state when `.git` is absent, or
 * when the path is not a work tree. Both cases surface as a non-zero
 * `git ls-files` exit. The `-z` flag makes paths with unusual characters
 * round-trip. Git delimits the output with NUL. The paths are relative to the
 * repository root, which is `wikiRoot`.
 */
function trackedSet(wikiRoot, subprocess) {
  const res = subprocess.runSync("git", ["ls-files", "-z"], { cwd: wikiRoot });
  if (res.exitCode !== 0) return null;
  return new Set(res.stdout.split("\0").filter((p) => p !== ""));
}

/**
 * Enumerate the admission universe under `wikiRoot`.
 * @param {{wikiRoot: string, fs: object, subprocess: object}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`). `subprocess` is
 *   `runtime.subprocess` (its `runSync` shells out to git).
 * @returns {string[]} Wiki-relative POSIX paths, tracked-filtered when git state exists.
 */
export function listAdmissionPaths({ wikiRoot, fs, subprocess }) {
  if (!fs.existsSync(wikiRoot)) return [];
  const walked = [];
  walk(wikiRoot, wikiRoot, fs, walked);
  const tracked = trackedSet(wikiRoot, subprocess);
  if (tracked === null) return walked;
  return walked.filter((p) => tracked.has(p));
}

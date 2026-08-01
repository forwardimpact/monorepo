import path from "node:path";

/**
 * Find the project root. The search looks upward for a `package.json` from the
 * current working directory. It uses the injected `runtime.finder` (the one
 * canonical Finder, which libutil alone constructs).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @returns {string}
 */
export function resolveProjectRoot(runtime) {
  return runtime.finder.findProjectRoot(runtime.proc.cwd());
}

/**
 * Resolve the wiki root and keep the pre-1370 order: the `--wiki-root` option
 * when the caller gives one, else `<projectRoot>/wiki`. The function consults
 * the finder only when the caller supplies no explicit `--wiki-root`.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @param {Record<string, unknown>} [options] - Parsed CLI options (`ctx.options`).
 * @returns {string}
 */
export function resolveWikiRoot(runtime, options = {}) {
  return options["wiki-root"] || path.join(resolveProjectRoot(runtime), "wiki");
}

/**
 * Report whether the resolved wiki root exists on disk. Commands that read or
 * sync an existing wiki use this to degrade gracefully (warn and exit 0) when
 * nobody bootstrapped the tree. One example is a fresh worktree where
 * `scripts/bootstrap.sh` did not run.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @param {string} wikiDir - The resolved wiki root.
 * @returns {boolean}
 */
export function wikiExists(runtime, wikiDir) {
  return runtime.fsSync.existsSync(wikiDir);
}

import path from "node:path";

/**
 * Find the project root by upward `package.json` discovery from the current
 * working directory, using the injected `runtime.finder` (the one canonical
 * Finder, constructed only inside libutil).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @returns {string}
 */
export function resolveProjectRoot(runtime) {
  return runtime.finder.findProjectRoot(runtime.proc.cwd());
}

/**
 * Resolve the wiki root, preserving the pre-1370 order: the `--wiki-root`
 * option when given, else `<projectRoot>/wiki`. The finder is consulted only
 * when no explicit `--wiki-root` is supplied.
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
 * the tree was never bootstrapped — e.g. a fresh worktree where
 * `scripts/bootstrap.sh` did not run.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @param {string} wikiDir - The resolved wiki root.
 * @returns {boolean}
 */
export function wikiExists(runtime, wikiDir) {
  return runtime.fsSync.existsSync(wikiDir);
}

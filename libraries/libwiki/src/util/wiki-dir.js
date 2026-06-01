import path from "node:path";

/**
 * Find the project root by upward `package.json` discovery from the current
 * working directory, using the injected `runtime.finder` (the one canonical
 * Finder — `new Finder(...)` lives only inside libutil).
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

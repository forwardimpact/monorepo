/**
 * Resolve a CLI's version string. In a `bun build --compile` binary,
 * `process.env.LIBCLI_VERSION` is replaced at build time by `just build-binary`'s
 * `--define`, so this returns the injected literal and the package.json read below
 * is dead code (it never executes — and tree-shakes). In source/npx execution the
 * env var is normally unset and the read supplies the version; setting LIBCLI_VERSION
 * in the environment overrides it (used by bin-smoke integration tests).
 *
 * The read must be written as the literal member expression `process.env.LIBCLI_VERSION`
 * — that is the token `bun build --define` substitutes across the whole bundle,
 * including this bundled library. A dynamic `process.env[name]` would not be replaced.
 *
 * @param {object} args
 * @param {URL|string} args.packageJsonUrl - `new URL("../package.json", import.meta.url)`
 * @param {import('@forwardimpact/libutil/runtime').Runtime} args.runtime
 * @returns {string}
 */
export function resolveVersion({ packageJsonUrl, runtime }) {
  const injected = process.env.LIBCLI_VERSION; // literal — the --define target
  if (injected) return injected;
  const text = runtime.fsSync.readFileSync(packageJsonUrl, "utf8");
  return JSON.parse(text).version;
}

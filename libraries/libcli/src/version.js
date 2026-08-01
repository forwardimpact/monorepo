/**
 * Resolve a CLI's version string. The string is the version of the package the
 * binary was built from (e.g. fit-terrain's). libcli only surfaces that
 * version. The value is never libcli's own version. In a `bun build --compile`
 * binary, `build/build-binary.sh`'s `--define` replaces
 * `process.env.LIBCLI_PACKAGE_VERSION` at build time. This function then
 * returns the injected literal. The package.json read below is dead code. It
 * never executes, and it tree-shakes. In source/npx execution the env var is
 * normally unset, and the read supplies the version. A LIBCLI_PACKAGE_VERSION
 * value in the environment overrides the read. The bin-smoke integration tests
 * use that override.
 *
 * Keep the read as the literal member expression
 * `process.env.LIBCLI_PACKAGE_VERSION`. `bun build --define` substitutes that
 * token across the whole bundle, this bundled library included. It does not
 * replace a dynamic `process.env[name]`.
 *
 * @param {object} args
 * @param {URL|string} args.packageJsonUrl - `new URL("../package.json", import.meta.url)`
 * @param {import('@forwardimpact/libutil/runtime').Runtime} args.runtime
 * @returns {string}
 */
export function resolveVersion({ packageJsonUrl, runtime }) {
  const injected = process.env.LIBCLI_PACKAGE_VERSION; // literal, the --define target
  if (injected) return injected;
  const text = runtime.fsSync.readFileSync(packageJsonUrl, "utf8");
  return JSON.parse(text).version;
}

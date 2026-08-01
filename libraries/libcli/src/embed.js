/**
 * Embedded assets for `bun build --compile` binaries.
 *
 * A compiled CLI runs from Bun's virtual `/$bunfs` filesystem with no
 * `node_modules` tree. Two runtime tricks locate package data directories on
 * disk: `import.meta.resolve("@scope/pkg")` plus
 * `readFileSync(join(dir, name))`. Both fail there. The `--help` smoke gate
 * never exercises those paths, so the breakage ships silently.
 *
 * This module is the runtime half of the fix. A CLI's `assets` block in
 * `build/cli-manifest.json` drives the build half. See `build/gen-embed.mjs`.
 * The build half inlines each asset file's text into the bundle. It then calls
 * {@link registerAssets} at startup. Consumers resolve asset directories
 * through {@link embeddedDir}. They also overlay their runtime with
 * {@link withEmbeddedAssets}, so the existing `fsSync`-based loaders read
 * embedded content transparently. No loader changes.
 *
 * In source/npx execution nothing registers. So {@link embeddedAssetsActive}
 * is false, and {@link withEmbeddedAssets} is a no-op. Callers fall back to
 * the on-disk resolution they already use.
 */

import { normalize, sep } from "node:path";

// Sentinel root for embedded asset paths. The value never collides with a real
// filesystem path. `embeddedDir(mount)` hangs logical mounts off it. The fs
// overlay recognises this prefix and serves the content from the registry.
const EMBED_ROOT = "/__fit_embed__";

/** @type {Map<string, string>} logical path (`<mount>/<relPosix>`) → file text. */
const registry = new Map();

/**
 * Register a mount's files. The generated barrel calls this function. The
 * compile step prepends that barrel to the entry point.
 *
 * @param {string} mount - Logical namespace, e.g. `"libsyntheticprose/prompts"`.
 * @param {Record<string, string>} files - Map of posix relative path → text.
 */
export function registerAssets(mount, files) {
  for (const [rel, content] of Object.entries(files)) {
    registry.set(`${mount}/${rel}`, content);
  }
}

/** True when a mount registered embedded assets (only in compiled builds). */
export function embeddedAssetsActive() {
  return registry.size > 0;
}

/**
 * Clear every registered mount. The clear restores the unregistered state, in
 * which {@link embeddedAssetsActive} is false and {@link withEmbeddedAssets}
 * is a no-op. Production never calls this function. A compiled binary
 * registers once at startup through the generated barrel, and it never resets.
 * The function exists so a test of the on-disk (unregistered) branch stays
 * hermetic, whatever order the tests run in a shared `bun test` process.
 * `registerAssets` writes a module-global registry. Without the reset, a test
 * that registers a mount leaks the active flag into every later test file.
 */
export function resetEmbeddedAssets() {
  registry.clear();
}

/**
 * True when this process is a `bun build --compile` standalone binary.
 *
 * `build/build-binary.sh` passes `--define process.env.LIBCLI_IS_COMPILED="1"`.
 * At compile time Bun substitutes `"1"` for the literal member expression
 * `process.env.LIBCLI_IS_COMPILED` across the whole bundle, this file
 * included. The comparison then folds to `true`. In source/npx/test execution
 * the env var is normally unset, so the value is `false`. This mirrors the
 * `LIBCLI_PACKAGE_VERSION` literal trick in version.js. It gives an explicit,
 * platform-independent build-time contract. It does not sniff Bun's internal
 * `/$bunfs` path convention.
 *
 * Keep the read as the literal token `process.env.LIBCLI_IS_COMPILED`.
 * `--define` replaces that token. It does not replace a dynamic
 * `process.env[name]`.
 *
 * @type {boolean}
 */
export const LIBCLI_IS_COMPILED = process.env.LIBCLI_IS_COMPILED === "1";

/**
 * Virtual directory for a registered mount. Join a filename onto it to get a
 * path that the {@link withEmbeddedAssets} overlay resolves from the registry.
 * A directory-based loader (`join(dir, name)` → `readFileSync`) then works
 * unchanged.
 *
 * @param {string} mount - Same namespace passed to {@link registerAssets}.
 * @returns {string}
 */
export function embeddedDir(mount) {
  return `${EMBED_ROOT}/${mount}`;
}

/**
 * Map a filesystem path under {@link EMBED_ROOT} to its registry key. Return
 * null when the path is not an embedded-asset path (normal file → delegate to
 * disk).
 */
function toLogicalKey(p) {
  if (typeof p !== "string") return null;
  const posix = normalize(p).split(sep).join("/");
  if (posix !== EMBED_ROOT && !posix.startsWith(`${EMBED_ROOT}/`)) return null;
  return posix.slice(EMBED_ROOT.length + 1);
}

/**
 * Return a runtime whose `fsSync` serves embedded assets for paths under the
 * sentinel root. That `fsSync` delegates every other path to the real
 * filesystem. The function does nothing when the registry is empty, so you can
 * call it unconditionally.
 *
 * @template {{ fsSync: object }} R
 * @param {R} runtime
 * @returns {R}
 */
export function withEmbeddedAssets(runtime) {
  if (!embeddedAssetsActive()) return runtime;
  const base = runtime.fsSync;
  const fsSync = {
    ...base,
    existsSync(p) {
      const key = toLogicalKey(p);
      if (key !== null && registry.has(key)) return true;
      return base.existsSync(p);
    },
    readFileSync(p, ...rest) {
      const key = toLogicalKey(p);
      if (key !== null && registry.has(key)) return registry.get(key);
      return base.readFileSync(p, ...rest);
    },
  };
  return Object.freeze({ ...runtime, fsSync });
}

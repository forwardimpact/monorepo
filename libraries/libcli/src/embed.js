/**
 * Embedded assets for `bun build --compile` binaries.
 *
 * A compiled CLI runs from Bun's virtual `/$bunfs` filesystem with no
 * `node_modules` tree, so the runtime tricks that locate package data
 * directories on disk — `import.meta.resolve("@scope/pkg")` plus
 * `readFileSync(join(dir, name))` — both fail. The `--help` smoke gate never
 * exercises those paths, so the breakage ships silently.
 *
 * This module is the runtime half of the fix. The build half (driven by a
 * CLI's `assets` block in `build/cli-manifest.json`, see `build/gen-embed.mjs`)
 * inlines each asset file's text into the bundle and calls {@link registerAssets}
 * at startup. Consumers then resolve asset directories through {@link embeddedDir}
 * and overlay their runtime with {@link withEmbeddedAssets} so the existing
 * `fsSync`-based loaders read embedded content transparently — no loader changes.
 *
 * In source/npx execution nothing registers, so {@link embeddedAssetsActive}
 * is false, {@link withEmbeddedAssets} is a no-op, and callers fall back to the
 * on-disk resolution they already use.
 */

import { normalize, sep } from "node:path";

// Sentinel root for embedded asset paths. Chosen to never collide with a real
// filesystem path. `embeddedDir(mount)` hangs logical mounts off it, and the
// fs overlay recognises this prefix to serve content from the registry.
const EMBED_ROOT = "/__fit_embed__";

/** @type {Map<string, string>} logical path (`<mount>/<relPosix>`) → file text. */
const registry = new Map();

/**
 * Register a mount's files. Called by the generated barrel that the compile
 * step prepends to the entry point.
 *
 * @param {string} mount - Logical namespace, e.g. `"libsyntheticprose/prompts"`.
 * @param {Record<string, string>} files - Map of posix relative path → text.
 */
export function registerAssets(mount, files) {
  for (const [rel, content] of Object.entries(files)) {
    registry.set(`${mount}/${rel}`, content);
  }
}

/** Whether any embedded assets were registered (true only in compiled builds). */
export function embeddedAssetsActive() {
  return registry.size > 0;
}

/**
 * Clear every registered mount, restoring the unregistered state in which
 * {@link embeddedAssetsActive} is false and {@link withEmbeddedAssets} is a
 * no-op. Production never calls this: a compiled binary registers once at
 * startup via the generated barrel and never resets. It exists so a test
 * exercising the on-disk (unregistered) branch is hermetic regardless of the
 * order tests run in a shared `bun test` process — `registerAssets` writes a
 * module-global registry, so a test that registers a mount would otherwise leak
 * the active flag into every later test file.
 */
export function resetEmbeddedAssets() {
  registry.clear();
}

/**
 * True when this process is a `bun build --compile` standalone binary.
 *
 * `build/build-binary.sh` passes `--define process.env.LIBCLI_IS_COMPILED="1"`,
 * so Bun substitutes the literal member expression `process.env.LIBCLI_IS_COMPILED`
 * with `"1"` across the whole bundle (this file included) at compile time and
 * the comparison folds to `true`. In source/npx/test execution the env var is
 * normally unset, so it is `false`. This mirrors the `LIBCLI_PACKAGE_VERSION`
 * literal trick in version.js — an explicit, platform-independent build-time
 * contract rather than sniffing Bun's internal `/$bunfs` path convention.
 *
 * The read must stay the literal token `process.env.LIBCLI_IS_COMPILED` — that
 * is what `--define` replaces; a dynamic `process.env[name]` would not be.
 *
 * @type {boolean}
 */
export const LIBCLI_IS_COMPILED = process.env.LIBCLI_IS_COMPILED === "1";

/**
 * Virtual directory for a registered mount. Joining a filename onto it yields a
 * path the {@link withEmbeddedAssets} overlay resolves from the registry, so a
 * directory-based loader (`join(dir, name)` → `readFileSync`) works unchanged.
 *
 * @param {string} mount - Same namespace passed to {@link registerAssets}.
 * @returns {string}
 */
export function embeddedDir(mount) {
  return `${EMBED_ROOT}/${mount}`;
}

/**
 * Map a filesystem path under {@link EMBED_ROOT} to its registry key, or null
 * if the path is not an embedded-asset path (normal file → delegate to disk).
 */
function toLogicalKey(p) {
  if (typeof p !== "string") return null;
  const posix = normalize(p).split(sep).join("/");
  if (posix !== EMBED_ROOT && !posix.startsWith(`${EMBED_ROOT}/`)) return null;
  return posix.slice(EMBED_ROOT.length + 1);
}

/**
 * Return a runtime whose `fsSync` serves embedded assets for paths under the
 * sentinel root and delegates everything else to the real filesystem. No-op
 * when no assets are registered, so it is safe to call unconditionally.
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

/**
 * Parse a comma-separated list of trusted `https://…` origins into a Set of
 * normalised origin strings (`new URL(s).origin`). Empty entries are dropped.
 * `http://` and malformed entries are skipped at load with a logged warning.
 * No globals read; caller hands in the raw string from its `libconfig`-loaded
 * service config.
 *
 * @param {string|null|undefined} raw Comma-separated string of origins.
 * @param {object} [options]
 * @param {{warn?: (msg: string, meta?: object) => void}} [options.logger]
 *   Optional logger; warnings are emitted but never thrown.
 * @returns {Set<string>} Set of normalised origin strings.
 */
export function loadTrustedIdpOrigins(raw, { logger } = {}) {
  const set = new Set();
  const entries = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      logger?.error?.("trusted-origins", "malformed entry; skipping", {
        entry,
      });
      continue;
    }
    if (url.protocol !== "https:") {
      logger?.error?.("trusted-origins", "non-TLS entry refused; skipping", {
        entry,
      });
      continue;
    }
    set.add(url.origin);
  }
  return set;
}

/**
 * Test whether `origin` (any URL string the caller has) belongs to `set`.
 * Compared as `new URL(origin).origin` against the Set's normalised entries.
 * Returns `false` on any URL parse error rather than throwing.
 *
 * @param {string} origin URL or origin string to test.
 * @param {Set<string>} set Set produced by `loadTrustedIdpOrigins`.
 * @returns {boolean} `true` if the URL's origin is in the set.
 */
export function isTrusted(origin, set) {
  try {
    return set.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

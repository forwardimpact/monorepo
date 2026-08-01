/**
 * Bounded-TTL cache of an OIDC issuer's JWKS.
 *
 * GitHub's OIDC issuer or JWKS endpoint can rotate. The cache holds the
 * key set for a config-driven TTL. It fetches the key set again when the
 * TTL expires. `invalidate()` marks the cached set stale. The validator
 * then recovers from a signature-verification failure caused by a rotated
 * key. The recovery needs no service restart.
 *
 * Any unauthenticated caller can reach `invalidate()`. A forged-signature
 * token drives the validator's invalidate-and-retry path. So a refetch
 * cooldown bounds the issuer fetch rate. Within `cooldown_ms` of the last
 * fetch, the cache serves the last-known-good key set and does not fetch
 * again. Concurrent refetches coalesce into a single in-flight request.
 * The cooldown delays legitimate key-rotation recovery by at most one
 * cooldown window. Inject `{ clock, fetch }` so tests drive the TTL and
 * the cooldown with a virtual clock and a stub fetch.
 */
export class JwksCache {
  #clock;
  #fetch;
  #issuer;
  #ttlMs;
  #cooldownMs;
  #cachedAt = Number.NEGATIVE_INFINITY;
  #lastFetchAt = Number.NEGATIVE_INFINITY;
  #keys = null;
  #inflight = null;

  /**
   * @param {object} options
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
   *   Injected clock collaborator. `now()` drives TTL and cooldown comparisons.
   * @param {typeof fetch} options.fetch - Injected fetch collaborator.
   * @param {string} options.issuer - OIDC issuer base URL.
   * @param {number} [options.ttl_ms] - Cache TTL in milliseconds.
   * @param {number} [options.cooldown_ms] - Minimum interval between issuer
   *   fetches while the cache holds a last-known-good key set.
   */
  constructor({
    clock,
    fetch: fetchFn,
    issuer,
    ttl_ms = 600_000,
    cooldown_ms = 30_000,
  }) {
    if (!clock) throw new Error("clock is required");
    if (!fetchFn) throw new Error("fetch is required");
    if (!issuer) throw new Error("issuer is required");
    this.#clock = clock;
    this.#fetch = fetchFn;
    this.#issuer = issuer;
    this.#ttlMs = ttl_ms;
    this.#cooldownMs = cooldown_ms;
  }

  /**
   * Return the cached JWKS keys. Fetch the keys if the cache is empty or
   * past its TTL. The cache serves a stale-but-present key set as-is while
   * the fetch cooldown holds. Concurrent callers past the cooldown share
   * one in-flight fetch.
   *
   * @returns {Promise<object[]>} The `keys` array from the JWKS document.
   */
  async getKeys() {
    const now = this.#clock.now();
    if (this.#keys && now - this.#cachedAt < this.#ttlMs) {
      return this.#keys;
    }
    if (this.#keys && now - this.#lastFetchAt < this.#cooldownMs) {
      return this.#keys;
    }
    if (!this.#inflight) {
      this.#inflight = this.#fetchKeys().finally(() => {
        this.#inflight = null;
      });
    }
    return this.#inflight;
  }

  /**
   * Fetch the JWKS document from the issuer. Cache its keys. Stamp the
   * cooldown when the attempt starts. The cache then does not hammer an
   * issuer that fails while it holds a last-known-good set.
   *
   * @returns {Promise<object[]>}
   */
  async #fetchKeys() {
    this.#lastFetchAt = this.#clock.now();
    const wellKnown = await this.#fetch(
      `${this.#issuer}/.well-known/openid-configuration`,
    );
    const { jwks_uri } = await wellKnown.json();
    const jwksRes = await this.#fetch(jwks_uri);
    this.#keys = (await jwksRes.json()).keys;
    this.#cachedAt = this.#clock.now();
    return this.#keys;
  }

  /**
   * Mark the cached key set stale so the next `getKeys()` past the fetch
   * cooldown re-fetches. The validator calls this after a
   * signature-verification failure to recover from JWKS rotation. The cache
   * retains and serves the last-known-good keys while the cooldown holds.
   * An unauthenticated forged-token storm then cannot force a fetch per
   * request.
   *
   * @returns {void}
   */
  invalidate() {
    this.#cachedAt = Number.NEGATIVE_INFINITY;
  }
}

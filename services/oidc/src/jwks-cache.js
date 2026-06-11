/**
 * Bounded-TTL cache of an OIDC issuer's JWKS.
 *
 * GitHub's OIDC issuer or JWKS endpoint can rotate. The cache holds the
 * key set for a config-driven TTL and re-fetches on expiry; `invalidate()`
 * marks the cached set stale so the validator can recover from a
 * signature-verification failure caused by a rotated key without a service
 * restart.
 *
 * Because `invalidate()` is reachable by any unauthenticated caller (a
 * forged-signature token drives the validator's invalidate-and-retry
 * path), a refetch cooldown bounds the issuer fetch rate: within
 * `cooldown_ms` of the last fetch the cache serves the last-known-good
 * key set instead of refetching, and concurrent refetches coalesce into
 * a single in-flight request. Legitimate key-rotation recovery is
 * delayed by at most one cooldown window. Inject `{ clock, fetch }` so
 * tests drive the TTL and cooldown with a virtual clock and a stub fetch.
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
   *   Injected clock collaborator; `now()` drives TTL and cooldown comparisons.
   * @param {typeof fetch} options.fetch - Injected fetch collaborator.
   * @param {string} options.issuer - OIDC issuer base URL.
   * @param {number} [options.ttl_ms] - Cache TTL in milliseconds.
   * @param {number} [options.cooldown_ms] - Minimum interval between issuer
   *   fetches while a last-known-good key set is held.
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
   * Return the cached JWKS keys, fetching them if the cache is empty or
   * past its TTL. A stale-but-present key set is served as-is while the
   * fetch cooldown holds; concurrent callers past the cooldown share one
   * in-flight fetch.
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
   * Fetch the JWKS document from the issuer and cache its keys. Stamps
   * the cooldown at attempt start so a failing issuer is not hammered
   * while a last-known-good set is held.
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
   * cooldown re-fetches. Called by the validator after a signature-
   * verification failure to recover from JWKS rotation. The last-known-good
   * keys are retained and served while the cooldown holds, so an
   * unauthenticated forged-token storm cannot force a fetch per request.
   *
   * @returns {void}
   */
  invalidate() {
    this.#cachedAt = Number.NEGATIVE_INFINITY;
  }
}

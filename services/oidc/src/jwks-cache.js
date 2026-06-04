/**
 * Bounded-TTL cache of an OIDC issuer's JWKS.
 *
 * GitHub's OIDC issuer or JWKS endpoint can rotate. The cache holds the
 * key set for a config-driven TTL and re-fetches on expiry; `invalidate()`
 * forces a re-fetch on the next call so the validator can recover from a
 * signature-verification failure caused by a rotated key without a service
 * restart. Inject `{ clock, fetch }` so tests drive the TTL with a virtual
 * clock and a stub fetch.
 */
export class JwksCache {
  #clock;
  #fetch;
  #issuer;
  #ttlMs;
  #cachedAt = 0;
  #keys = null;

  /**
   * @param {object} options
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
   *   Injected clock collaborator; `now()` drives TTL comparisons.
   * @param {typeof fetch} options.fetch - Injected fetch collaborator.
   * @param {string} options.issuer - OIDC issuer base URL.
   * @param {number} [options.ttl_ms] - Cache TTL in milliseconds.
   */
  constructor({ clock, fetch: fetchFn, issuer, ttl_ms = 600_000 }) {
    if (!clock) throw new Error("clock is required");
    if (!fetchFn) throw new Error("fetch is required");
    if (!issuer) throw new Error("issuer is required");
    this.#clock = clock;
    this.#fetch = fetchFn;
    this.#issuer = issuer;
    this.#ttlMs = ttl_ms;
  }

  /**
   * Return the cached JWKS keys, fetching them if the cache is empty or
   * past its TTL.
   *
   * @returns {Promise<object[]>} The `keys` array from the JWKS document.
   */
  async getKeys() {
    if (this.#keys && this.#clock.now() - this.#cachedAt < this.#ttlMs) {
      return this.#keys;
    }
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
   * Drop the cached key set so the next `getKeys()` re-fetches. Called by
   * the validator after a signature-verification failure to recover from
   * JWKS rotation.
   *
   * @returns {void}
   */
  invalidate() {
    this.#keys = null;
    this.#cachedAt = 0;
  }
}

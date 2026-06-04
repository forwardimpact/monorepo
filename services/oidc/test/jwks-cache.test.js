import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockClock } from "@forwardimpact/libmock";
import { JwksCache } from "../index.js";

const ISSUER = "https://token.actions.githubusercontent.com";

function stubFetch({ keys }) {
  let configCalls = 0;
  let jwksCalls = 0;
  const fetchFn = async (url) => {
    if (url.endsWith("/.well-known/openid-configuration")) {
      configCalls += 1;
      return { json: async () => ({ jwks_uri: `${ISSUER}/keys` }) };
    }
    jwksCalls += 1;
    return { json: async () => ({ keys }) };
  };
  return {
    fetchFn,
    get configCalls() {
      return configCalls;
    },
    get jwksCalls() {
      return jwksCalls;
    },
  };
}

describe("JwksCache", () => {
  test("caches within the TTL window", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1000,
    });
    await cache.getKeys();
    await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 1, "second call is served from cache");
  });

  test("re-fetches after the TTL expires", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1000,
    });
    await cache.getKeys();
    clock.advance(1001);
    await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 2, "expired cache re-fetches");
  });

  test("invalidate forces a re-fetch", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1_000_000,
    });
    await cache.getKeys();
    cache.invalidate();
    await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 2, "invalidate drops the cache");
  });
});

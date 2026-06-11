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
      cooldown_ms: 0,
    });
    await cache.getKeys();
    clock.advance(1001);
    await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 2, "expired cache re-fetches");
  });

  test("invalidate forces a re-fetch once the cooldown has passed", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1_000_000,
      cooldown_ms: 30_000,
    });
    await cache.getKeys();
    cache.invalidate();
    clock.advance(30_001);
    await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 2, "invalidate drops the cache");
  });

  test("invalidate within the cooldown serves last-known-good keys without refetching", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1_000_000,
      cooldown_ms: 30_000,
    });
    const first = await cache.getKeys();
    cache.invalidate();
    clock.advance(29_999);
    const second = await cache.getKeys();
    assert.strictEqual(f.jwksCalls, 1, "cooldown suppresses the refetch");
    assert.deepStrictEqual(second, first, "stale keys are served as-is");
  });

  test("repeated invalidate calls cannot drive one fetch per request", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1_000_000,
      cooldown_ms: 30_000,
    });
    await cache.getKeys();
    for (let i = 0; i < 100; i++) {
      cache.invalidate();
      clock.advance(100);
      await cache.getKeys();
    }
    assert.strictEqual(
      f.jwksCalls,
      1,
      "a 10s invalidate storm stays within the 30s cooldown",
    );
  });

  test("concurrent cold-cache callers share one in-flight fetch", async () => {
    const clock = createMockClock({ start: 0 });
    const f = stubFetch({ keys: [{ kid: "a" }] });
    const cache = new JwksCache({
      clock,
      fetch: f.fetchFn,
      issuer: ISSUER,
      ttl_ms: 1_000_000,
    });
    const [a, b] = await Promise.all([cache.getKeys(), cache.getKeys()]);
    assert.strictEqual(
      f.jwksCalls,
      1,
      "second caller joins the in-flight fetch",
    );
    assert.deepStrictEqual(a, b);
  });
});

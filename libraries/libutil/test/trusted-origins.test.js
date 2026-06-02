import { describe, test } from "node:test";
import assert from "node:assert";
import { isTrusted, loadTrustedIdpOrigins } from "../src/trusted-origins.js";

function recordingLogger() {
  // Mirrors the @forwardimpact/libtelemetry Logger surface: there is no
  // `warn` method; level-elevated diagnostics flow through `error(appId,
  // message, attributes)`. Recording `error` lets the loader's diagnostics
  // be observable in tests AND in production wiring.
  const entries = [];
  return {
    error: (appId, message, attributes) =>
      entries.push({ appId, message, attributes }),
    entries,
  };
}

describe("loadTrustedIdpOrigins", () => {
  test("normalises explicit :443 to the bare-default form on https", () => {
    const set = loadTrustedIdpOrigins(
      "https://github.com:443,https://github.com",
    );
    assert.deepStrictEqual([...set], ["https://github.com"]);
  });

  test("trailing-dot host yields a distinct origin (no implicit normalisation)", () => {
    const set = loadTrustedIdpOrigins("https://github.com,https://github.com.");
    assert.strictEqual(set.size, 2);
    assert.strictEqual(set.has("https://github.com"), true);
    assert.strictEqual(set.has("https://github.com."), true);
  });

  test("refuses http://… via logger.error(appId, message, attributes); does not add", () => {
    const logger = recordingLogger();
    const set = loadTrustedIdpOrigins("http://github.com", { logger });
    assert.strictEqual(set.size, 0);
    assert.strictEqual(logger.entries.length, 1);
    assert.strictEqual(logger.entries[0].appId, "trusted-origins");
    assert.match(logger.entries[0].message, /non-TLS/);
    assert.strictEqual(logger.entries[0].attributes.entry, "http://github.com");
  });

  test("skips a malformed entry via logger.error; other valid entries still populate", () => {
    const logger = recordingLogger();
    const set = loadTrustedIdpOrigins("not-a-url, https://github.com", {
      logger,
    });
    assert.deepStrictEqual([...set], ["https://github.com"]);
    assert.strictEqual(logger.entries.length, 1);
    assert.strictEqual(logger.entries[0].appId, "trusted-origins");
    assert.match(logger.entries[0].message, /malformed/);
    assert.strictEqual(logger.entries[0].attributes.entry, "not-a-url");
  });

  test("empty / unset / null raw yields an empty set", () => {
    assert.strictEqual(loadTrustedIdpOrigins("").size, 0);
    assert.strictEqual(loadTrustedIdpOrigins(undefined).size, 0);
    assert.strictEqual(loadTrustedIdpOrigins(null).size, 0);
  });

  test("trims surrounding whitespace on each comma entry", () => {
    const set = loadTrustedIdpOrigins(
      "  https://a.example , https://b.example  ",
    );
    assert.deepStrictEqual([...set].sort(), [
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("isTrusted", () => {
  test("matches when the URL's normalised origin is in the set", () => {
    const set = loadTrustedIdpOrigins("https://github.com");
    assert.strictEqual(
      isTrusted("https://github.com/login/oauth/authorize", set),
      true,
    );
  });

  test("rejects a confusable subdomain suffix", () => {
    const set = loadTrustedIdpOrigins("https://github.com");
    assert.strictEqual(
      isTrusted("https://github.com.attacker.example/path", set),
      false,
    );
  });

  test("rejects when nothing is trusted", () => {
    assert.strictEqual(isTrusted("https://github.com", new Set()), false);
  });

  test("rejects on URL parse failure rather than throwing", () => {
    const set = loadTrustedIdpOrigins("https://github.com");
    assert.strictEqual(isTrusted("not-a-url", set), false);
  });

  test("treats trailing-dot host as a distinct origin (matches design O6 (a))", () => {
    const setBare = loadTrustedIdpOrigins("https://github.com");
    const setDotted = loadTrustedIdpOrigins("https://github.com.");
    assert.strictEqual(isTrusted("https://github.com.", setBare), false);
    assert.strictEqual(isTrusted("https://github.com", setDotted), false);
  });
});

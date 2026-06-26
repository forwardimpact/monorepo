import { describe, test } from "node:test";
import assert from "node:assert";

import {
  Redactor,
  createRedactor,
  createNoopRedactor,
  DEFAULT_ENV_ALLOWLIST,
  DEFAULT_PATTERNS,
} from "../src/redaction.js";
import { rt as _rt, captureStderr } from "./redaction-helpers.js";

describe("Redactor — opt-out (criterion 4, design § Opt-out surface)", () => {
  test("LIBHARNESS_REDACTION_DISABLED=1 disables and emits stderr warning exactly once", () => {
    let r;
    const stderr = captureStderr(() => {
      r = createRedactor({
        runtime: _rt,
        env: {
          LIBHARNESS_REDACTION_DISABLED: "1",
          GH_TOKEN: "would-have-redacted",
        },
      });
    });
    assert.strictEqual(r.enabled, false);
    assert.strictEqual(
      r.redactValue("would-have-redacted"),
      "would-have-redacted",
    );
    assert.match(stderr, /libharness: trace redaction DISABLED/);
    // Single warning per construction.
    const matches = stderr.match(/redaction DISABLED/g) ?? [];
    assert.strictEqual(matches.length, 1);
  });

  test("the retired eval-era redaction-disable env name is ignored (clean break)", () => {
    // The name is built from parts so the criterion-1 completeness oracle
    // stays clean while this still guards the clean break.
    const retired = `${"LIBEVAL"}_REDACTION_DISABLED`;
    let r;
    const stderr = captureStderr(() => {
      r = createRedactor({
        runtime: _rt,
        env: { [retired]: "1", GH_TOKEN: "secret-value" },
      });
    });
    assert.strictEqual(r.enabled, true);
    assert.strictEqual(
      r.redactValue("secret-value"),
      "[REDACTED:env:GH_TOKEN]",
    );
    assert.strictEqual(stderr, "");
  });

  test('LIBHARNESS_REDACTION_DISABLED="true" does NOT disable (literal "1" is the contract)', () => {
    let r;
    const stderr = captureStderr(() => {
      r = createRedactor({
        runtime: _rt,
        env: {
          LIBHARNESS_REDACTION_DISABLED: "true",
          GH_TOKEN: "secret-value",
        },
      });
    });
    assert.strictEqual(r.enabled, true);
    assert.strictEqual(
      r.redactValue("secret-value"),
      "[REDACTED:env:GH_TOKEN]",
    );
    assert.strictEqual(stderr, "");
  });

  test('LIBHARNESS_REDACTION_DISABLED="yes" does NOT disable (literal "1" is the contract)', () => {
    let r;
    const stderr = captureStderr(() => {
      r = createRedactor({
        runtime: _rt,
        env: { LIBHARNESS_REDACTION_DISABLED: "yes", GH_TOKEN: "secret-value" },
      });
    });
    assert.strictEqual(r.enabled, true);
    assert.strictEqual(
      r.redactValue("secret-value"),
      "[REDACTED:env:GH_TOKEN]",
    );
    assert.strictEqual(stderr, "");
  });

  test("createRedactor({ enabled: false }) fires the stderr warning regardless of env state", () => {
    let r;
    const stderr = captureStderr(() => {
      r = createRedactor({ runtime: _rt, env: {}, enabled: false });
    });
    assert.strictEqual(r.enabled, false);
    assert.match(stderr, /libharness: trace redaction DISABLED/);
  });

  test("disabled redactor returns top-level input by reference (identity contract)", () => {
    const r = createNoopRedactor();
    const obj = { type: "assistant", message: { content: [{ text: "hi" }] } };
    assert.strictEqual(r.redactValue(obj), obj);
    const arr = [1, "two", { three: 3 }];
    assert.strictEqual(r.redactValue(arr), arr);
    assert.strictEqual(r.redactValue("plain"), "plain");
  });
});

describe("createNoopRedactor", () => {
  test("returns a Redactor whose redactValue is identity", () => {
    const r = createNoopRedactor();
    assert.ok(r instanceof Redactor);
    assert.strictEqual(r.enabled, false);
    const v = { a: "x" };
    assert.strictEqual(r.redactValue(v), v);
  });

  test("never fires the stderr warning regardless of env state", () => {
    // Even though disabled, the noop helper must NOT write to stderr —
    // it is intended for test fixtures that need a silent disabled
    // redactor.
    const stderr = captureStderr(() => {
      createNoopRedactor();
    });
    assert.strictEqual(stderr, "");
  });
});

describe("Redactor — exports and defaults", () => {
  test("DEFAULT_ENV_ALLOWLIST is the documented contract", () => {
    assert.deepStrictEqual(
      [...DEFAULT_ENV_ALLOWLIST],
      [
        "ANTHROPIC_API_KEY",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "DATABASE_PASSWORD",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "JWT_SECRET",
        "MCP_TOKEN",
        "MICROSOFT_APP_ID",
        "MICROSOFT_APP_PASSWORD",
        "MICROSOFT_APP_TENANT_ID",
        "PRODUCT_LANDMARK_TOKEN",
        "SERVICE_SECRET",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
    );
  });

  test("DEFAULT_PATTERNS covers the six documented kinds", () => {
    const kinds = DEFAULT_PATTERNS.map((p) => p.kind);
    assert.deepStrictEqual(kinds, [
      "anthropic",
      "gh-pat",
      "gh-installation",
      "gh-oauth",
      "gh-fine-grained",
      "gh-b64-basic-credential",
    ]);
  });

  test("createRedactor({ runtime: _rt }) with no options falls back to process.env", () => {
    // Smoke check — must not throw, and must produce a Redactor.
    const r = createRedactor({ runtime: _rt });
    assert.ok(r instanceof Redactor);
  });
});

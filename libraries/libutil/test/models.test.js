import { describe, test } from "node:test";
import assert from "node:assert";

import * as models from "../src/models.js";

// Wiring tests only — the exact model values are an upgrade-time decision,
// not a behavior this suite should pin. We assert shape and intent.
const MODEL_ID = /^claude-[a-z0-9.-]+(\[1m\])?$/;

describe("models", () => {
  test("every export is a well-formed Claude model identifier", () => {
    const entries = Object.entries(models);
    assert.ok(entries.length > 0);
    for (const [name, value] of entries) {
      assert.strictEqual(typeof value, "string", name);
      assert.match(value, MODEL_ID, name);
    }
  });

  test("long-session roles carry the 1M-context suffix", () => {
    // Agents and leads both run long multi-turn sessions; leads
    // orchestrate entire multi-agent meetings on top of that.
    assert.ok(models.AGENT_MODEL.endsWith("[1m]"));
    assert.ok(models.LEAD_MODEL.endsWith("[1m]"));
  });

  test("direct Messages API roles use plain model IDs", () => {
    // The [1m] suffix is an Agent SDK identifier; these constants are
    // also passed to the raw API (fit-terrain, examples) where a
    // suffixed ID would 404.
    assert.ok(!models.CHAT_MODEL.includes("["));
    assert.ok(!models.FAST_MODEL.includes("["));
  });
});

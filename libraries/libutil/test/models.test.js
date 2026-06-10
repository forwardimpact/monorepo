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

  test("AGENT_MODEL carries the 1M-context suffix", () => {
    assert.ok(models.AGENT_MODEL.endsWith("[1m]"));
  });

  test("LEAD_MODEL is AGENT_MODEL's family without the context suffix", () => {
    assert.strictEqual(
      models.LEAD_MODEL,
      models.AGENT_MODEL.replace("[1m]", ""),
    );
  });
});

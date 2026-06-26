import { test, describe } from "node:test";
import assert from "node:assert";

import { sumTraceCost, UNSOURCED } from "../src/cost.js";

/** Build NDJSON lines from an array of records. */
function lines(records) {
  return records.map((r) => JSON.stringify(r));
}

describe("sumTraceCost", () => {
  test("sums total_cost_usd across all sources in a combined trace", () => {
    const { totalCostUsd, bySource } = sumTraceCost(
      lines([
        {
          source: "agent",
          seq: 0,
          event: { type: "result", total_cost_usd: 0.02 },
        },
        {
          source: "supervisor",
          seq: 1,
          event: { type: "result", total_cost_usd: 0.05 },
        },
        {
          source: "judge",
          seq: 2,
          event: { type: "result", total_cost_usd: 0.01 },
        },
      ]),
    );
    assert.ok(Math.abs(totalCostUsd - 0.08) < 1e-9);
    assert.deepStrictEqual(bySource, {
      agent: 0.02,
      supervisor: 0.05,
      judge: 0.01,
    });
  });

  test("accumulates multiple result events from the same source", () => {
    const { totalCostUsd, bySource } = sumTraceCost(
      lines([
        {
          source: "agent",
          seq: 0,
          event: { type: "result", total_cost_usd: 0.02 },
        },
        {
          source: "agent",
          seq: 1,
          event: { type: "result", total_cost_usd: 0.03 },
        },
      ]),
    );
    assert.ok(Math.abs(totalCostUsd - 0.05) < 1e-9);
    assert.ok(Math.abs(bySource.agent - 0.05) < 1e-9);
  });

  test("buckets bare (un-enveloped) result events under the agent source", () => {
    const { totalCostUsd, bySource } = sumTraceCost(
      lines([{ type: "result", total_cost_usd: 0.04 }]),
    );
    assert.ok(Math.abs(totalCostUsd - 0.04) < 1e-9);
    assert.ok(Math.abs(bySource[UNSOURCED] - 0.04) < 1e-9);
  });

  test("ignores non-result events, blank lines, and malformed JSON", () => {
    const { totalCostUsd, bySource } = sumTraceCost([
      "",
      "{not json",
      JSON.stringify({ source: "agent", seq: 0, event: { type: "assistant" } }),
      JSON.stringify({
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", verdict: "success" },
      }),
      JSON.stringify({ source: "agent", seq: 2, event: { type: "result" } }),
    ]);
    assert.strictEqual(totalCostUsd, 0);
    assert.deepStrictEqual(bySource, {});
  });
});

import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { runCostCommand } from "../src/commands/trace.js";

const FILE = "/traces/trace--demo.raw.ndjson";

/**
 * Invoke the cost handler over a seeded NDJSON file, capturing stdout.
 * @param {object} options - Parsed flags (e.g. { markdown: true }).
 * @param {object[]} records - Trace records written as NDJSON.
 * @returns {Promise<string>} Captured stdout.
 */
async function cost(options, records) {
  const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const fsSync = createMockFs({ [FILE]: body });
  let out = "";
  await runCostCommand({
    options,
    args: { file: FILE },
    deps: {
      runtime: { fsSync, proc: { stdout: { write: (s) => (out += s) } } },
    },
  });
  return out;
}

const COMBINED = [
  { source: "agent", seq: 0, event: { type: "result", total_cost_usd: 0.02 } },
  {
    source: "supervisor",
    seq: 1,
    event: { type: "result", total_cost_usd: 0.05 },
  },
];

describe("fit-trace cost", () => {
  test("default JSON output reports total and per-source breakdown", async () => {
    const out = await cost({}, COMBINED);
    const parsed = JSON.parse(out);
    assert.ok(Math.abs(parsed.totalCostUsd - 0.07) < 1e-9);
    assert.deepStrictEqual(parsed.bySource, { agent: 0.02, supervisor: 0.05 });
  });

  test("--markdown emits a headline total and a per-participant table", async () => {
    const out = await cost({ markdown: true }, COMBINED);
    assert.match(out, /### 💰 Run cost: \$0\.0700/);
    assert.match(out, /\| supervisor \| 0\.0500 \|/);
    assert.match(out, /\| agent \| 0\.0200 \|/);
  });
});

import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { runCostCommand } from "../src/commands/trace.js";

const FILE = "/traces/trace--demo.raw.ndjson";

/**
 * Invoke the cost handler over a seeded NDJSON file and capture stdout.
 * @param {object} options - Parsed flags (e.g. { markdown: true }).
 * @param {object[]} records - Trace records written as NDJSON.
 * @returns {Promise<string>} Captured stdout.
 */
async function cost(options, records) {
  const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  return costOf(options, body);
}

/**
 * Invoke the cost handler over a seeded file body and capture stdout.
 * @param {object} options - Parsed flags (e.g. { markdown: true }).
 * @param {string} body - Raw file content (structured JSON or NDJSON).
 * @returns {Promise<string>} Captured stdout.
 */
async function costOf(options, body) {
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

describe("gemba-trace cost", () => {
  test("default JSON output reports the total and the per-source breakdown", async () => {
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

  test("a missing trace file exits ok and prints nothing", async () => {
    // A CI cost step runs under always(). The trace may not exist when the
    // run failed before it produced one. The handler must not throw.
    const fsSync = createMockFs({});
    let out = "";
    const result = await runCostCommand({
      options: { markdown: true },
      args: { file: "/traces/absent.ndjson" },
      deps: {
        runtime: { fsSync, proc: { stdout: { write: (s) => (out += s) } } },
      },
    });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(out, "");
  });

  test("an empty trace file reports zero cost", async () => {
    const out = await cost({}, []);
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.totalCostUsd, 0);
    assert.deepStrictEqual(parsed.bySource, {});
  });
});

const STAND_DOWN_SUMMARY = {
  source: "orchestrator",
  seq: 2,
  event: {
    type: "summary",
    success: true,
    verdict: "stand_down",
    turns: 1,
    summary: "Self-caused event with no new work.",
  },
};

const STRUCTURED = {
  version: "1.3.0",
  metadata: {},
  orchestrator: { verdict: "stand_down" },
  turns: [],
  summary: { totalCostUsd: 0.07 },
};

describe("gemba-trace cost reports the terminal verdict", () => {
  test("NDJSON with a stand_down summary yields the verdict in JSON", async () => {
    const out = await cost({}, [...COMBINED, STAND_DOWN_SUMMARY]);
    assert.strictEqual(JSON.parse(out).verdict, "stand_down");
  });

  test("NDJSON with a stand_down summary yields a verdict line in markdown", async () => {
    const out = await cost({ markdown: true }, [
      ...COMBINED,
      STAND_DOWN_SUMMARY,
    ]);
    assert.match(out, /^Verdict: `stand_down`$/m);
  });

  test("a structured document yields the orchestrator verdict in JSON", async () => {
    const out = await costOf({}, JSON.stringify(STRUCTURED));
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.totalCostUsd, 0.07);
    assert.strictEqual(parsed.verdict, "stand_down");
  });

  test("a structured document yields a verdict line in markdown", async () => {
    const out = await costOf({ markdown: true }, JSON.stringify(STRUCTURED));
    assert.match(out, /^Verdict: `stand_down`$/m);
  });

  test("a trace with no summary yields a null verdict and no line", async () => {
    const json = JSON.parse(await cost({}, COMBINED));
    assert.strictEqual(json.verdict, null);
    const markdown = await cost({ markdown: true }, COMBINED);
    assert.ok(!markdown.includes("Verdict:"));
  });
});

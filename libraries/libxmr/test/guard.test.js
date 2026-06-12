import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";

import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { runChartCommand } from "../src/commands/chart.js";
import { runListCommand } from "../src/commands/list.js";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const CSV_PATH = "/metrics/metrics.csv";

// Issue #1702 repro: both conflict branches interleaved among valid rows.
const CORRUPTED = [
  "date,metric,value,unit,run,note,event_type",
  "2026-06-01,m,1,count,r1,,kata-shift",
  "<<<<<<< HEAD",
  "2026-06-02,m,2,count,r2,,kata-shift",
  "=======",
  "2026-06-02,m,9,count,r2x,,kata-shift",
  ">>>>>>> theirs",
  "2026-06-03,m,3,count,r3,,kata-shift",
].join("\n");

function runCorrupted(handler, options = {}) {
  const fsSync = createMockFs({ [CSV_PATH]: CORRUPTED });
  const rt = makeRuntime({ fsSync });
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": CSV_PATH },
  });
  const result = handler(ctx);
  return { result, stdout: rt.stdout };
}

// Each read command must refuse a conflict-marker CSV with a clean error
// envelope naming the file and line — never chart, list, or summarize it.
describe("read commands refuse conflict-marker CSVs", () => {
  const commands = [
    ["analyze", runAnalyzeCommand],
    ["chart", runChartCommand],
    ["list", runListCommand],
    ["summarize", runSummarizeCommand],
  ];

  for (const [name, handler] of commands) {
    test(`${name} returns an error envelope, writes nothing`, () => {
      const { result, stdout } = runCorrupted(handler);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 2);
      assert.match(result.error, /cannot parse CSV/);
      assert.ok(result.error.includes(CSV_PATH));
      assert.match(result.error, /git conflict marker at line 3/);
      assert.strictEqual(stdout, "");
    });
  }

  test("analyze refuses even with --format json", () => {
    const { result, stdout } = runCorrupted(runAnalyzeCommand, {
      format: "json",
      "event-type": "*",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(stdout, "");
  });
});

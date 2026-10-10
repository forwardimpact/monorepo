import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";

import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { runChartCommand } from "../src/commands/chart.js";
import { runListCommand } from "../src/commands/list.js";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { makeRuntime, ctxFor, MIXED_CSV } from "./helpers.js";

const CSV_PATH = "/metrics/metrics.csv";

// This corruption shape comes from the field. Both conflict branches
// interleave among valid rows.
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

function runWith(content, handler, options = {}) {
  const fsSync = createMockFs({ [CSV_PATH]: content });
  const rt = makeRuntime({ fsSync });
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": CSV_PATH },
  });
  const result = handler(ctx);
  return { result, stdout: rt.stdout };
}

// Each read command must refuse a conflict-marker CSV. It must return a clean
// error envelope that names the file and the line. It must never chart, list,
// or summarize the CSV.
describe("read commands refuse conflict-marker CSVs", () => {
  const commands = [
    ["analyze", runAnalyzeCommand],
    ["chart", runChartCommand],
    ["list", runListCommand],
    ["summarize", runSummarizeCommand],
  ];

  for (const [name, handler] of commands) {
    test(`${name} returns an error envelope and writes nothing`, () => {
      const { result, stdout } = runWith(CORRUPTED, handler);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 2);
      assert.match(result.error, /cannot parse CSV/);
      assert.ok(result.error.includes(CSV_PATH));
      assert.match(result.error, /git conflict marker at line 3/);
      assert.strictEqual(stdout, "");
    });
  }

  test("analyze refuses even with --format json", () => {
    const { result, stdout } = runWith(CORRUPTED, runAnalyzeCommand, {
      format: "json",
      "event-type": "*",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(stdout, "");
  });
});

// Each read command must refuse a flag-free read over a file with several
// slices and a named slice that matches no row. The envelope names
// the file, lists the tally, and names the flag. It never prints a partial
// report.
describe("read commands refuse an unresolved slice", () => {
  const commands = [
    ["analyze", runAnalyzeCommand],
    ["chart", runChartCommand],
    ["list", runListCommand],
    ["summarize", runSummarizeCommand],
  ];

  for (const [name, handler] of commands) {
    test(`${name} with no flag over two slices returns the ambiguous envelope`, () => {
      const { result, stdout } = runWith(MIXED_CSV, handler);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 2);
      assert.ok(result.error.startsWith("cannot resolve slice for"));
      assert.ok(result.error.includes(CSV_PATH));
      assert.ok(
        result.error.includes("kata-dispatch (2 rows), kata-shift (2 rows)"),
      );
      assert.ok(
        result.error.endsWith("Pass --event-type <name> or --event-type '*'"),
      );
      assert.strictEqual(stdout, "");
    });
  }

  test("a named slice that matches no row of a non-empty file is a failed read", () => {
    const { result, stdout } = runWith(MIXED_CSV, runListCommand, {
      "event-type": "nope",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 2);
    assert.match(result.error, /no rows with event_type "nope"/);
    assert.ok(
      result.error.includes("kata-dispatch (2 rows), kata-shift (2 rows)"),
    );
    assert.strictEqual(stdout, "");
  });
});

import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { runChartCommand } from "../src/commands/chart.js";
import { makeRuntime, ctxFor } from "./helpers.js";

function makeCSV(metric, values, { unit = "count" } = {}) {
  const header = "date,metric,value,unit,run,note";
  const rows = values.map((v, i) => {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
    return `2026-${month}-${day},${metric},${v},${unit},,`;
  });
  return [header, ...rows].join("\n");
}

function withTempCSV(content, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "fit-xmr-summarize-"));
  const file = path.join(dir, "metrics.csv");
  writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runSummarize(csvPath, options = {}) {
  const rt = makeRuntime();
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": csvPath },
  });
  const result = runSummarizeCommand(ctx);
  return { result, stdout: rt.stdout, stderr: rt.stderr };
}

function runChart(csvPath, options = {}) {
  const rt = makeRuntime();
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": csvPath },
  });
  const result = runChartCommand(ctx);
  return { result, stdout: rt.stdout, stderr: rt.stderr };
}

describe("summarize command", () => {
  test("emits a markdown table for sufficient data", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const csv = makeCSV("stable_metric", values);

    withTempCSV(csv, (file) => {
      const { result, stdout } = runSummarize(file);
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /\*\*XmR — `.*`\*\*/);
      assert.match(
        stdout,
        /\| metric \| n \| latest \| μ \| UPL \| LPL \| classification \| signals \|/,
      );
      assert.match(stdout, /\| stable_metric \| 20 \|/);
      assert.match(stdout, /\| stable \|/);
    });
  });

  test("notes insufficient data without a stats row", () => {
    const csv = makeCSV("new_metric", [1, 2, 3]);

    withTempCSV(csv, (file) => {
      const { result, stdout } = runSummarize(file);
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /Insufficient data \(n<15\):_ new_metric \(n=3\)\./);
      assert.doesNotMatch(stdout, /\| metric \| n \|/);
    });
  });

  test("emits JSON in the same {source, generated, metrics} shape as analyze", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const csv = makeCSV("m", values);

    withTempCSV(csv, (file) => {
      const { result, stdout } = runSummarize(file, { format: "json" });
      assert.ok(result.ok, JSON.stringify(result));
      const parsed = JSON.parse(stdout);
      assert.ok(parsed.source);
      assert.ok(parsed.generated);
      assert.strictEqual(parsed.metrics.length, 1);
      assert.strictEqual(parsed.metrics[0].metric, "m");
      assert.strictEqual(parsed.metrics[0].classification, "stable");
      assert.ok(parsed.metrics[0].stats.mu > 10);
      assert.ok(parsed.metrics[0].signals);
      assert.deepStrictEqual(parsed.metrics[0].signals.xRule1, []);
    });
  });

  test("filters by --metric", () => {
    const csv = [
      "date,metric,value,unit,run,note",
      ...Array.from({ length: 20 }, (_, i) => {
        const d = `2026-01-${String((i % 28) + 1).padStart(2, "0")}`;
        return `${d},a,${10 + (i % 2)},count,,`;
      }),
      ...Array.from({ length: 20 }, (_, i) => {
        const d = `2026-02-${String((i % 28) + 1).padStart(2, "0")}`;
        return `${d},b,${20 + (i % 2)},count,,`;
      }),
    ].join("\n");

    withTempCSV(csv, (file) => {
      const { result, stdout } = runSummarize(file, { metric: "b" });
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /\| b \|/);
      assert.doesNotMatch(stdout, /\| a \|/);
    });
  });

  test("requires a csv-path argument", () => {
    const rt = makeRuntime();
    const ctx = ctxFor({ runtime: rt.runtime, options: {}, args: {} });
    const result = runSummarizeCommand(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /requires a <csv-path>/);
  });

  test("flags non-stable classification when X Rule 2 fires", () => {
    // 10 above-mean then 10 below-mean → run of 10 above + run of 10 below.
    const values = [
      ...Array.from({ length: 10 }, () => 20),
      ...Array.from({ length: 10 }, () => 5),
    ];
    const csv = makeCSV("shifty", values);

    withTempCSV(csv, (file) => {
      const { result, stdout } = runSummarize(file, { format: "json" });
      assert.ok(result.ok, JSON.stringify(result));
      const parsed = JSON.parse(stdout);
      assert.notStrictEqual(parsed.metrics[0].classification, "stable");
      assert.ok(parsed.metrics[0].signals.xRule2.length > 0);
    });
  });
});

describe("chart command", () => {
  test("renders a 14-line chart for the §10 worked example", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);

    withTempCSV(csv, (file) => {
      const { result, stdout } = runChart(file, { metric: "ex" });
      assert.ok(result.ok, JSON.stringify(result));
      const lines = stdout.replace(/\n$/, "").split("\n");
      assert.strictEqual(lines.length, 14);
      assert.ok(lines[0].includes("UPL 12.5"));
      assert.ok(lines[0].includes("●"));
      assert.ok(lines[6].includes("LPL 0.3"));
      assert.ok(lines[8].includes("URL 7.5"));
      assert.ok(lines[13].includes(" 1  2  3"));
    });
  });

  test("defaults to the sole metric when --metric is omitted", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    withTempCSV(csv, (file) => {
      const { result, stdout } = runChart(file);
      assert.ok(result.ok, JSON.stringify(result));
      assert.ok(stdout.includes("UPL 12.5"));
      assert.ok(stdout.includes("●"));
    });
  });

  test("requires --metric when the CSV carries multiple metrics", () => {
    const csv = [
      "date,metric,value,unit,run,note",
      "2026-01-01,a,1,count,,",
      "2026-01-02,b,2,count,,",
    ].join("\n");
    withTempCSV(csv, (file) => {
      const { result } = runChart(file);
      assert.equal(result.ok, false);
      assert.match(result.error, /requires --metric/);
    });
  });

  test("rejects --format json", () => {
    const csv = makeCSV("ex", [1, 2, 3]);
    withTempCSV(csv, (file) => {
      const { result } = runChart(file, { metric: "ex", format: "json" });
      assert.equal(result.ok, false);
      assert.match(result.error, /does not support --format json/);
    });
  });

  test("--ascii substitutes ASCII glyphs", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    withTempCSV(csv, (file) => {
      const { result, stdout } = runChart(file, { metric: "ex", ascii: true });
      assert.ok(result.ok, JSON.stringify(result));
      assert.ok(stdout.includes("X-bar"));
      assert.ok(stdout.includes("R-bar"));
      assert.ok(stdout.includes("*"));
      assert.ok(!stdout.includes("●"));
      assert.ok(!stdout.includes("σ"));
    });
  });

  test("notes insufficient data when n < 15", () => {
    const csv = makeCSV("ex", [1, 2, 3]);
    withTempCSV(csv, (file) => {
      const { result, stdout } = runChart(file, { metric: "ex" });
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /Insufficient data/);
    });
  });
});

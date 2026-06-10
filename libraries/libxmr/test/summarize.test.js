import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { runChartCommand } from "../src/commands/chart.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const CSV_PATH = "/metrics/metrics.csv";

function makeCSV(metric, values, { unit = "count" } = {}) {
  const header = "date,metric,value,unit,run,note,event_type";
  const rows = values.map((v, i) => {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
    return `2026-${month}-${day},${metric},${v},${unit},,,kata-shift`;
  });
  return [header, ...rows].join("\n");
}

// Seed the CSV in an in-memory fs and hand `fn` both the path and the fs the
// command should read it through. The commands only emit to stdout, so the
// on-disk file is never inspected.
function withTempCSV(content, fn) {
  const fsSync = createMockFs({ [CSV_PATH]: content });
  return fn(CSV_PATH, fsSync);
}

function runSummarize(csvPath, fsSync, options = {}) {
  const rt = makeRuntime({ fsSync });
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": csvPath },
  });
  const result = runSummarizeCommand(ctx);
  return { result, stdout: rt.stdout, stderr: rt.stderr };
}

function runChart(csvPath, fsSync, options = {}) {
  const rt = makeRuntime({ fsSync });
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

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runSummarize(file, fsSync);
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

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runSummarize(file, fsSync);
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /Insufficient data \(n<15\):_ new_metric \(n=3\)\./);
      assert.doesNotMatch(stdout, /\| metric \| n \|/);
    });
  });

  test("emits JSON in the same {source, generated, metrics} shape as analyze", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const csv = makeCSV("m", values);

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runSummarize(file, fsSync, { format: "json" });
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
      "date,metric,value,unit,run,note,event_type",
      ...Array.from({ length: 20 }, (_, i) => {
        const d = `2026-01-${String((i % 28) + 1).padStart(2, "0")}`;
        return `${d},a,${10 + (i % 2)},count,,,kata-shift`;
      }),
      ...Array.from({ length: 20 }, (_, i) => {
        const d = `2026-02-${String((i % 28) + 1).padStart(2, "0")}`;
        return `${d},b,${20 + (i % 2)},count,,,kata-shift`;
      }),
    ].join("\n");

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runSummarize(file, fsSync, { metric: "b" });
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

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runSummarize(file, fsSync, { format: "json" });
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

    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runChart(file, fsSync, { metric: "ex" });
      assert.ok(result.ok, JSON.stringify(result));
      const lines = stdout.replace(/\n$/, "").split("\n");
      // Two leading lines name the event_type slice; the chart body is 14.
      assert.strictEqual(lines.length, 16);
      assert.strictEqual(lines[0], "# event_type: kata-shift");
      assert.ok(lines[2].includes("UPL 12.5"));
      assert.ok(lines[2].includes("●"));
      assert.ok(lines[8].includes("LPL 0.3"));
      assert.ok(lines[10].includes("URL 7.5"));
      assert.ok(lines[15].includes(" 1  2  3"));
    });
  });

  test("defaults to the sole metric when --metric is omitted", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runChart(file, fsSync);
      assert.ok(result.ok, JSON.stringify(result));
      assert.ok(stdout.includes("UPL 12.5"));
      assert.ok(stdout.includes("●"));
    });
  });

  test("requires --metric when the CSV carries multiple metrics", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,a,1,count,,,kata-shift",
      "2026-01-02,b,2,count,,,kata-shift",
    ].join("\n");
    withTempCSV(csv, (file, fsSync) => {
      const { result } = runChart(file, fsSync);
      assert.equal(result.ok, false);
      assert.match(result.error, /requires --metric/);
    });
  });

  test("rejects --format json", () => {
    const csv = makeCSV("ex", [1, 2, 3]);
    withTempCSV(csv, (file, fsSync) => {
      const { result } = runChart(file, fsSync, {
        metric: "ex",
        format: "json",
      });
      assert.equal(result.ok, false);
      assert.match(result.error, /does not support --format json/);
    });
  });

  test("--ascii substitutes ASCII glyphs", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runChart(file, fsSync, {
        metric: "ex",
        ascii: true,
      });
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
    withTempCSV(csv, (file, fsSync) => {
      const { result, stdout } = runChart(file, fsSync, { metric: "ex" });
      assert.ok(result.ok, JSON.stringify(result));
      assert.match(stdout, /Insufficient data/);
    });
  });
});

describe("event_type slice naming", () => {
  function mixedCSV() {
    const header = "date,metric,value,unit,run,note,event_type";
    const rows = [];
    for (let i = 0; i < 20; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      rows.push(`2026-01-${day},m,${10 + (i % 2)},count,,,kata-shift`);
      rows.push(`2026-01-${day},m,${1 + (i % 2)},count,,,kata-dispatch`);
    }
    return [header, ...rows].join("\n");
  }

  test("summarize defaults to the kata-shift slice and names it", () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runSummarize(csvPath, fsSync);
      assert.match(stdout, /event_type: kata-shift/);
      assert.match(stdout, /\| m \| 20 \|/);
    });
  });

  test("summarize --event-type kata-dispatch reports the dispatch slice", () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runSummarize(csvPath, fsSync, {
        "event-type": "kata-dispatch",
      });
      assert.match(stdout, /event_type: kata-dispatch/);
      assert.match(stdout, /\| m \| 20 \|/);
    });
  });

  test('summarize --event-type "*" reports all rows and names the slice', () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runSummarize(csvPath, fsSync, { "event-type": "*" });
      assert.match(stdout, /event_type: \* \(all rows\)/);
      assert.match(stdout, /\| m \| 40 \|/);
    });
  });

  test("summarize json carries a top-level event_type field", () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runSummarize(csvPath, fsSync, { format: "json" });
      const parsed = JSON.parse(stdout);
      assert.strictEqual(parsed.event_type, "kata-shift");
    });
  });

  test("chart names the slice above the chart body", () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runChart(csvPath, fsSync, { metric: "m" });
      assert.match(stdout, /^# event_type: kata-shift\n\n/);
    });
  });

  test("chart --event-type kata-dispatch charts the dispatch slice", () => {
    withTempCSV(mixedCSV(), (csvPath, fsSync) => {
      const { stdout } = runChart(csvPath, fsSync, {
        metric: "m",
        "event-type": "kata-dispatch",
      });
      assert.match(stdout, /^# event_type: kata-dispatch\n\n/);
    });
  });
});


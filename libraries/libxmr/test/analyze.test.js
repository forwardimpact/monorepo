import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";

import { analyze } from "../src/analyze.js";
import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { makeRuntime, ctxFor } from "./helpers.js";

function makeCSV(metric, values, { unit = "count" } = {}) {
  const header = "date,metric,value,unit,run,note,event_type";
  const rows = values.map((v, i) => {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
    return `2026-${month}-${day},${metric},${v},${unit},,,kata-shift`;
  });
  return [header, ...rows].join("\n");
}

describe("analyze", () => {
  test("returns insufficient_data for fewer than 15 points", () => {
    const csv = makeCSV("bugs", [1, 2, 3, 4, 5]);
    const result = analyze(csv);
    assert.strictEqual(result.metrics[0].status, "insufficient_data");
    assert.strictEqual(result.metrics[0].classification, "insufficient");
    assert.strictEqual(result.metrics[0].n, 5);
  });

  test("returns predictable for stable data with no signals", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const csv = makeCSV("stable", values);
    const result = analyze(csv);
    assert.strictEqual(result.metrics[0].status, "predictable");
    assert.strictEqual(result.metrics[0].classification, "stable");
  });

  test("groups multiple metrics independently", () => {
    const rows = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,a,1,count,r,,kata-shift",
      "2026-01-01,b,2,count,r,,kata-shift",
      "2026-01-02,a,3,count,r,,kata-shift",
    ];
    const result = analyze(rows.join("\n"));
    assert.strictEqual(result.metrics.length, 2);
    assert.strictEqual(result.metrics[0].metric, "a");
    assert.strictEqual(result.metrics[1].metric, "b");
  });

  test("includes latest observation with mr", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 3));
    const csv = makeCSV("m", values);
    const result = analyze(csv);
    const m = result.metrics[0];
    assert.ok(m.latest);
    assert.strictEqual(m.latest.value, values[values.length - 1]);
    assert.strictEqual(typeof m.latest.mr, "number");
  });

  test("Wheeler §10 example resolves to signals classification", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    const m = analyze(csv).metrics[0];
    assert.strictEqual(m.status, "signals_present");
    assert.strictEqual(m.classification, "chaos");
    assert.strictEqual(m.signals.xRule1.length, 1);
    assert.strictEqual(m.signals.mrRule1.length, 1);
  });

  test("all-zero series at the window → predictable / degenerate-zero", () => {
    const csv = makeCSV(
      "flat",
      Array.from({ length: 15 }, () => 0),
    );
    const m = analyze(csv).metrics[0];
    assert.strictEqual(m.status, "predictable");
    assert.strictEqual(m.classification, "degenerate-zero");
  });

  test("distinguishes degenerate-zero from substantive stable", () => {
    const flat = analyze(
      makeCSV(
        "flat",
        Array.from({ length: 15 }, () => 0),
      ),
    ).metrics[0];
    const stable = analyze(
      makeCSV(
        "stable",
        Array.from({ length: 20 }, (_, i) => 10 + (i % 2)),
      ),
    ).metrics[0];
    assert.strictEqual(flat.status, "predictable");
    assert.strictEqual(stable.status, "predictable");
    assert.strictEqual(flat.classification, "degenerate-zero");
    assert.strictEqual(stable.classification, "stable");
  });

  test("all-zero series below the window → insufficient (boundary unchanged)", () => {
    const csv = makeCSV(
      "flat",
      Array.from({ length: 14 }, () => 0),
    );
    const m = analyze(csv).metrics[0];
    assert.strictEqual(m.status, "insufficient_data");
    assert.strictEqual(m.classification, "insufficient");
  });

  test("exposes raw stats and full series for chart rendering", () => {
    const csv = makeCSV(
      "ex",
      Array.from({ length: 20 }, (_, i) => 10 + (i % 2)),
    );
    const m = analyze(csv).metrics[0];
    assert.ok(m.stats);
    assert.strictEqual(typeof m.stats.mu, "number");
    assert.strictEqual(typeof m.stats.UPL, "number");
    assert.strictEqual(typeof m.stats.LPL, "number");
    assert.strictEqual(typeof m.stats.URL, "number");
    assert.strictEqual(typeof m.stats.zoneUpper, "number");
    assert.ok(Array.isArray(m.values));
    assert.ok(Array.isArray(m.dates));
    assert.strictEqual(m.values.length, m.n);
  });

  test("reads a file mixing legacy 7-col and 8-col host_run rows (spec 1910 criterion 6)", () => {
    // Build a 20-point series where odd rows are legacy (7 columns, no
    // host_run) and even rows carry the trailing host_run column. host_run
    // never feeds analysis, so the result must match the host_run-free series.
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const header = "date,metric,value,unit,run,note,event_type,host_run";
    const rows = values.map((v, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const base = `2026-01-${day},mix,${v},count,,,kata-shift`;
      return i % 2 === 0 ? `${base},27401632821` : base;
    });
    const mixed = analyze([header, ...rows].join("\n")).metrics[0];
    const plain = analyze(makeCSV("mix", values)).metrics[0];

    assert.strictEqual(mixed.n, plain.n);
    assert.deepStrictEqual(mixed.values, plain.values);
    assert.strictEqual(mixed.status, plain.status);
    assert.strictEqual(mixed.stats.mu, plain.stats.mu);
  });
});

describe("analyze event_type slicing", () => {
  const mixed = [
    "date,metric,value,unit,run,note,event_type",
    "2026-01-01,m,1,count,r,,kata-dispatch",
    "2026-01-02,m,100,count,r,,kata-shift",
    "2026-01-03,m,2,count,r,,kata-dispatch",
    "2026-01-04,m,101,count,r,,kata-shift",
  ].join("\n");

  test("explicit eventType restricts to that slice", () => {
    const result = analyze(mixed, { eventType: "kata-shift" });
    assert.deepStrictEqual(result.metrics[0].values, [100, 101]);
  });

  test("default slice is kata-shift", () => {
    const result = analyze(mixed);
    assert.deepStrictEqual(result.metrics[0].values, [100, 101]);
  });

  test('"*" disables the filter', () => {
    const result = analyze(mixed, { eventType: "*" });
    assert.deepStrictEqual(result.metrics[0].values, [1, 100, 2, 101]);
  });

  test("slice with no rows yields no metrics", () => {
    const result = analyze(mixed, { eventType: "kata-coaching" });
    assert.strictEqual(result.metrics.length, 0);
  });
});

describe("analyze command slice naming", () => {
  const CSV_PATH = "/metrics/metrics.csv";
  const MIXED = [
    "date,metric,value,unit,run,note,event_type",
    "2026-01-01,m,1,count,,,kata-dispatch",
    "2026-01-02,m,100,count,,,kata-shift",
  ].join("\n");

  function runAnalyze(options = {}) {
    const fsSync = createMockFs({ [CSV_PATH]: MIXED });
    const rt = makeRuntime({ fsSync });
    const ctx = ctxFor({
      runtime: rt.runtime,
      options,
      args: { "csv-path": CSV_PATH },
    });
    const result = runAnalyzeCommand(ctx);
    return { result, stdout: rt.stdout };
  }

  test("text output names the default slice", () => {
    const { stdout } = runAnalyze();
    assert.match(stdout, /event_type: kata-shift/);
  });

  test('text output names "*" as all rows', () => {
    const { stdout } = runAnalyze({ "event-type": "*" });
    assert.match(stdout, /event_type: \* \(all rows\)/);
  });

  test("json output carries a top-level event_type field", () => {
    const { stdout } = runAnalyze({ format: "json" });
    assert.strictEqual(JSON.parse(stdout).event_type, "kata-shift");
  });
});

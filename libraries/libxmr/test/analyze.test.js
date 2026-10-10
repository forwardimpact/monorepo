import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";

import { analyze, listMetrics } from "../src/analyze.js";
import { parseCSV } from "../src/csv.js";
import { runAnalyzeCommand } from "../src/commands/analyze.js";
import {
  makeRuntime,
  ctxFor,
  analyzeAll,
  MIXED_CSV,
  SINGLE_CSV,
} from "./helpers.js";

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
    const result = analyzeAll(csv);
    assert.strictEqual(result.metrics[0].status, "insufficient_data");
    assert.strictEqual(result.metrics[0].classification, "insufficient");
    assert.strictEqual(result.metrics[0].n, 5);
  });

  test("returns predictable for stable data with no signals", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const csv = makeCSV("stable", values);
    const result = analyzeAll(csv);
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
    const result = analyzeAll(rows.join("\n"));
    assert.strictEqual(result.metrics.length, 2);
    assert.strictEqual(result.metrics[0].metric, "a");
    assert.strictEqual(result.metrics[1].metric, "b");
  });

  test("includes latest observation with mr", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 3));
    const csv = makeCSV("m", values);
    const result = analyzeAll(csv);
    const m = result.metrics[0];
    assert.ok(m.latest);
    assert.strictEqual(m.latest.value, values[values.length - 1]);
    assert.strictEqual(typeof m.latest.mr, "number");
  });

  test("Wheeler §10 example resolves to signals classification", () => {
    const csv = makeCSV("ex", [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5]);
    const m = analyzeAll(csv).metrics[0];
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
    const m = analyzeAll(csv).metrics[0];
    assert.strictEqual(m.status, "predictable");
    assert.strictEqual(m.classification, "degenerate-zero");
  });

  test("distinguishes degenerate-zero from substantive stable", () => {
    const flat = analyzeAll(
      makeCSV(
        "flat",
        Array.from({ length: 15 }, () => 0),
      ),
    ).metrics[0];
    const stable = analyzeAll(
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
    const m = analyzeAll(csv).metrics[0];
    assert.strictEqual(m.status, "insufficient_data");
    assert.strictEqual(m.classification, "insufficient");
  });

  test("exposes raw stats and full series for the chart renderer", () => {
    const csv = makeCSV(
      "ex",
      Array.from({ length: 20 }, (_, i) => 10 + (i % 2)),
    );
    const m = analyzeAll(csv).metrics[0];
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

  test("reads a file that mixes legacy 7-col and 8-col host_run rows", () => {
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
    const mixed = analyzeAll([header, ...rows].join("\n")).metrics[0];
    const plain = analyzeAll(makeCSV("mix", values)).metrics[0];

    assert.strictEqual(mixed.n, plain.n);
    assert.deepStrictEqual(mixed.values, plain.values);
    assert.strictEqual(mixed.status, plain.status);
    assert.strictEqual(mixed.stats.mu, plain.stats.mu);
  });
});

describe("analyze event_type slices", () => {
  const rows = parseCSV(MIXED_CSV);

  test("explicit eventType restricts to that slice", () => {
    const result = analyze(rows, { eventType: "kata-shift" });
    assert.strictEqual(result.metrics.length, 1);
    assert.strictEqual(result.metrics[0].metric, "shift_only");
    assert.deepStrictEqual(result.metrics[0].values, [100, 101]);
  });

  // The library holds no default. A caller that names no slice fails at the
  // seam.
  test("throws TypeError without a slice", () => {
    assert.throws(() => analyze(rows), TypeError);
    assert.throws(() => analyze(rows, {}), TypeError);
    assert.throws(() => analyze(rows, { eventType: "  " }), TypeError);
  });

  test("listMetrics throws TypeError without a slice", () => {
    assert.throws(() => listMetrics(rows), TypeError);
    assert.throws(() => listMetrics(rows, { eventType: "" }), TypeError);
  });

  test('"*" disables the filter', () => {
    const result = analyze(rows, { eventType: "*" });
    assert.strictEqual(result.metrics.length, 2);
    assert.deepStrictEqual(result.metrics[0].values, [1, 2]);
    assert.deepStrictEqual(result.metrics[1].values, [100, 101]);
  });

  test("slice with no rows yields no metrics", () => {
    const result = analyze(rows, { eventType: "kata-coaching" });
    assert.strictEqual(result.metrics.length, 0);
  });
});

describe("listMetrics", () => {
  const rows = parseCSV(
    [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,a,1,count,r,,kata-shift",
      "2026-01-02,a,2,count,r,,kata-shift",
      "2026-01-01,b,5,days,r,,kata-dispatch",
    ].join("\n"),
  );

  test("returns the metric inventory for the named slice", () => {
    const metrics = listMetrics(rows, { eventType: "kata-shift" });

    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].metric, "a");
    assert.strictEqual(metrics[0].n, 2);
    assert.strictEqual(metrics[0].from, "2026-01-01");
    assert.strictEqual(metrics[0].to, "2026-01-02");
  });

  test("filters to the other slice when the caller names it", () => {
    const metrics = listMetrics(rows, { eventType: "kata-dispatch" });
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].metric, "b");
  });

  test('treats "*" as no filter', () => {
    const metrics = listMetrics(rows, { eventType: "*" });
    assert.strictEqual(metrics.length, 2);
    assert.strictEqual(metrics[1].unit, "days");
  });
});

describe("analyze command slice names", () => {
  const CSV_PATH = "/metrics/metrics.csv";

  function runAnalyze(options = {}, content = MIXED_CSV) {
    const fsSync = createMockFs({ [CSV_PATH]: content });
    const rt = makeRuntime({ fsSync });
    const ctx = ctxFor({
      runtime: rt.runtime,
      options,
      args: { "csv-path": CSV_PATH },
    });
    const result = runAnalyzeCommand(ctx);
    return { result, stdout: rt.stdout };
  }

  // A flag-free read over two slices is a failed read.
  test("a flag-free read over two slices returns the ambiguous envelope", () => {
    const { result, stdout } = runAnalyze();
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 2);
    assert.match(
      result.error,
      /^cannot resolve slice for "\/metrics\/metrics\.csv": several event_type values: kata-dispatch \(2 rows\), kata-shift \(2 rows\)/,
    );
    assert.strictEqual(stdout, "");
  });

  test("the json format does not change the ambiguous envelope", () => {
    const { result, stdout } = runAnalyze({ format: "json" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 2);
    assert.strictEqual(stdout, "");
  });

  test('text output names "*" as all rows', () => {
    const { stdout } = runAnalyze({ "event-type": "*" });
    assert.match(stdout, /event_type: \* \(all rows\)/);
  });

  test("the inferred sole slice appears in the text label and the JSON event_type", () => {
    const text = runAnalyze({}, SINGLE_CSV);
    assert.ok(text.result.ok, JSON.stringify(text.result));
    assert.match(text.stdout, /event_type: kata-shift/);
    const json = runAnalyze({ format: "json" }, SINGLE_CSV);
    assert.strictEqual(JSON.parse(json.stdout).event_type, "kata-shift");
  });
});

describe("analyze — route partition", () => {
  const header = "date,metric,value,unit,run,note,event_type";
  const csv = [
    header,
    '2026-06-20,implementations_shipped,1,count,r1,"route_taken=1; routes_eligible=[1,3]",kata-shift',
    '2026-06-21,implementations_shipped,0,count,r2,"route_taken=3; routes_eligible=[3,4]",kata-shift',
    '2026-06-22,implementations_shipped,1,count,r3,"route_taken=1; routes_eligible=[1]",kata-shift',
  ].join("\n");

  function metricN(report) {
    const m = report.metrics.find(
      (x) => x.metric === "implementations_shipped",
    );
    return m ? m.n : 0;
  }

  test("--route filters to rows whose route_taken matches", () => {
    assert.strictEqual(metricN(analyzeAll(csv, { route: "1" })), 2);
    assert.strictEqual(metricN(analyzeAll(csv, { route: "3" })), 1);
  });

  test("--routes-eligible-includes filters by eligible-set membership", () => {
    assert.strictEqual(
      metricN(analyzeAll(csv, { routesEligibleIncludes: "3" })),
      2,
    );
    assert.strictEqual(
      metricN(analyzeAll(csv, { routesEligibleIncludes: "4" })),
      1,
    );
  });

  test("no route filter returns the full series unchanged", () => {
    assert.strictEqual(metricN(analyzeAll(csv)), 3);
  });
});

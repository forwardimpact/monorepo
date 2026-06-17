import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { renderBlock, BlockRenderError } from "../src/block-renderer.js";
import { analyze, renderChart, CSVIntegrityError } from "@forwardimpact/libxmr";

const HEADER = "date,metric,value,unit,run,note,event_type";
const ROOT = "/project";

function makeCSV(metric, values) {
  const rows = values.map(
    (v, i) =>
      `2026-01-${String(i + 1).padStart(2, "0")},${metric},${v},count,,,kata-shift`,
  );
  return [HEADER, ...rows].join("\n");
}

// Seed the CSV in an in-memory fs at `${ROOT}/test.csv`; renderBlock reads it
// via the injected sync surface (join(projectRoot, csvPath)).
function csvFs(csv) {
  return createMockFs({ [`${ROOT}/test.csv`]: csv });
}

describe("renderBlock", () => {
  test("predictable metric renders chart fenced code and Signals", () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

    const lines = renderBlock({
      metric: "findings",
      csvPath: "test.csv",
      projectRoot: ROOT,
      fs: csvFs(makeCSV("findings", values)),
    });

    assert.equal(lines[0], "```");

    const report = analyze(makeCSV("findings", values));
    const m = report.metrics[0];
    const expectedChart = renderChart(m.values, m.stats, m.signals);
    const chartContent = lines.slice(1, lines.indexOf("```", 1)).join("\n");
    assert.equal(chartContent, expectedChart);

    const lastLine = lines[lines.length - 1];
    assert.ok(lastLine.startsWith("**Signals:**"));
    assert.ok(lastLine.includes("—"));
  });

  test("signals_present metric lists fired rules", () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 50];

    const lines = renderBlock({
      metric: "outlier",
      csvPath: "test.csv",
      projectRoot: ROOT,
      fs: csvFs(makeCSV("outlier", values)),
    });

    const signalLine = lines[lines.length - 1];
    assert.ok(signalLine.includes("xRule1") || signalLine.includes("mrRule1"));
  });

  test("insufficient_data metric shows insufficient message", () => {
    const values = [10, 20, 30, 40, 50];

    const lines = renderBlock({
      metric: "few",
      csvPath: "test.csv",
      projectRoot: ROOT,
      fs: csvFs(makeCSV("few", values)),
    });

    assert.equal(lines[0], "```");
    const chartLine = lines[1];
    assert.ok(chartLine.includes("Insufficient data"));
    assert.ok(chartLine.includes("5 points"));
  });

  // Fail-visible contract (#1702): a conflict-marker CSV must abort the
  // render, not produce a chart from duplicated or junk rows.
  test("propagates CSVIntegrityError from a conflict-marker CSV", () => {
    const corrupted = [
      HEADER,
      "<<<<<<< Updated upstream",
      "2026-06-12,findings,10,count,,,kata-shift",
      "=======",
      "2026-06-12,findings,9,count,,,kata-shift",
      ">>>>>>> Stashed changes",
    ].join("\n");

    assert.throws(
      () =>
        renderBlock({
          metric: "findings",
          csvPath: "test.csv",
          projectRoot: ROOT,
          fs: csvFs(corrupted),
        }),
      CSVIntegrityError,
    );
  });

  test("surfaces recomputation-revealed vs new-point provenance with a prior-read anchor", () => {
    // #1692 shape: early high cluster (slots 6/7/8), then a favorable zero-run
    // (slots 13..32) tightening limits. Slot 12 = anchor date 2026-01-12.
    const values = [
      2, 3, 2, 3, 2, 9, 8, 9, 3, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ];
    // Month-rolling dates: index i -> 2026-MM-DD, day=(i%28)+1, month=floor(i/28)+1.
    const header = "date,metric,value,unit,run,note,event_type";
    const rows = values.map((v, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      return `2026-${month}-${day},corrections,${v},count,,,kata-shift`;
    });
    const csv = [header, ...rows].join("\n");

    const lines = renderBlock({
      metric: "corrections",
      csvPath: "test.csv",
      projectRoot: ROOT,
      fs: csvFs(csv),
      priorReadAnchor: "2026-01-12",
    });

    const signalLine = lines[lines.length - 1];
    // X Rule 1 fires only on the pre-anchor cluster — purely recomputation-revealed.
    assert.ok(signalLine.includes("xRule1 (recomputation-revealed)"));
    // X Rule 2 fires on both the pre-anchor run and the post-anchor zero-run,
    // so it carries both tags — the new-point tag is attached to xRule2.
    assert.ok(
      signalLine.includes("xRule2 (recomputation-revealed, new-point)"),
    );
  });

  test("renders bare rule names when no prior-read anchor is supplied", () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 50];
    const lines = renderBlock({
      metric: "outlier",
      csvPath: "test.csv",
      projectRoot: ROOT,
      fs: csvFs(makeCSV("outlier", values)),
    });
    const signalLine = lines[lines.length - 1];
    assert.ok(!signalLine.includes("("));
  });

  test("throws BlockRenderError for missing metric", () => {
    assert.throws(
      () =>
        renderBlock({
          metric: "nonexistent",
          csvPath: "test.csv",
          projectRoot: ROOT,
          fs: csvFs(makeCSV("exists", [10, 20, 30])),
        }),
      BlockRenderError,
    );
  });
});

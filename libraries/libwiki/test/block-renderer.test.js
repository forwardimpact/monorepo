import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { renderBlock, BlockRenderError } from "../src/block-renderer.js";
import { analyze, renderChart } from "@forwardimpact/libxmr";

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

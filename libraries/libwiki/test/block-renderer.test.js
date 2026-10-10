import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { CSVIntegrityError } from "@forwardimpact/libxmr";
import { renderBlock } from "../src/block-renderer.js";
import {
  METRICS_HEADER,
  chartTextFor,
  makeMetricsCSV,
  metricsRows,
  twoSliceCSV,
} from "./helpers.js";

const ROOT = "/project";
const FIFTEEN = Array(15).fill(10);
const TWO_SLICE_CSV = twoSliceCSV("a", "b");

// Seed the CSV in an in-memory fs at `${ROOT}/test.csv`. renderBlock reads it
// through the injected sync surface (join(projectRoot, csvPath)).
function render(csv, overrides = {}) {
  return renderBlock({
    metric: "findings",
    csvPath: "test.csv",
    projectRoot: ROOT,
    fs: createMockFs({ [`${ROOT}/test.csv`]: csv }),
    ...overrides,
  });
}

const fenced = (lines) => lines.slice(1, lines.indexOf("```", 1)).join("\n");

describe("renderBlock", () => {
  test("a predictable metric renders fenced chart code and Signals", () => {
    const csv = makeMetricsCSV("findings", FIFTEEN);
    const lines = render(csv);

    assert.equal(lines[0], "```");
    assert.equal(fenced(lines), chartTextFor(csv, "*", "findings"));

    const lastLine = lines[lines.length - 1];
    assert.ok(lastLine.startsWith("**Signals:**"));
    assert.ok(lastLine.includes("—"));
  });

  test("signals_present metric lists fired rules", () => {
    const values = [...Array(14).fill(10), 50];
    const lines = render(makeMetricsCSV("outlier", values), {
      metric: "outlier",
    });
    const signalLine = lines[lines.length - 1];
    assert.ok(signalLine.includes("xRule1") || signalLine.includes("mrRule1"));
  });

  test("insufficient_data metric shows the insufficient message", () => {
    const lines = render(makeMetricsCSV("few", [10, 20, 30, 40, 50]), {
      metric: "few",
    });
    assert.equal(lines[0], "```");
    assert.ok(lines[1].includes("Insufficient data"));
    assert.ok(lines[1].includes("5 points"));
  });

  // Fail-visible contract (#1702): a conflict-marker CSV must abort the
  // render. It must not produce a chart from duplicated or junk rows.
  test("propagates CSVIntegrityError from a conflict-marker CSV", () => {
    const corrupted = [
      METRICS_HEADER,
      "<<<<<<< Updated upstream",
      "2026-06-12,findings,10,count,,,kata-shift",
      "=======",
      "2026-06-12,findings,9,count,,,kata-shift",
      ">>>>>>> Stashed changes",
    ].join("\n");
    assert.throws(() => render(corrupted), CSVIntegrityError);
  });

  test("surfaces recomputation-revealed vs new-point provenance with a prior-read anchor", () => {
    // #1692 shape: early high cluster (slots 6/7/8), then a favorable zero-run
    // (slots 13..32) that tightens the limits. Slot 12 = anchor date
    // 2026-01-12.
    const values = [
      2, 3, 2, 3, 2, 9, 8, 9, 3, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ];
    // Month-rolling dates: index i -> 2026-MM-DD, day=(i%28)+1, month=floor(i/28)+1.
    const rows = values.map((v, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      return `2026-${month}-${day},corrections,${v},count,,,kata-shift`;
    });
    const lines = render([METRICS_HEADER, ...rows].join("\n"), {
      metric: "corrections",
      priorReadAnchor: "2026-01-12",
    });
    const signalLine = lines[lines.length - 1];
    // X Rule 1 fires only on the pre-anchor cluster. It is purely
    // recomputation-revealed.
    assert.ok(signalLine.includes("xRule1 (recomputation-revealed)"));
    // X Rule 2 fires on both the pre-anchor run and the post-anchor zero-run,
    // so it carries both tags. The new-point tag attaches to xRule2.
    assert.ok(
      signalLine.includes("xRule2 (recomputation-revealed, new-point)"),
    );
  });

  test("renders bare rule names when the caller supplies no prior-read anchor", () => {
    const lines = render(
      makeMetricsCSV("outlier", [...Array(14).fill(10), 50]),
      {
        metric: "outlier",
      },
    );
    assert.ok(!lines[lines.length - 1].includes("("));
  });

  test("a metric absent from the slice renders a notice with the tally", () => {
    const lines = render(makeMetricsCSV("exists", [10, 20, 30]), {
      metric: "nonexistent",
    });
    assert.deepEqual(lines, [
      "> **XmR block not rendered.** No rows for metric `nonexistent` in slice `kata-shift`.",
      "> Values present: kata-shift (3 rows).",
    ]);
  });
});

// The marker's slice: a marker names its slice with `event_type=`, a marker
// without one follows the read rule against its file, and every render
// failure is a notice inside the block.
describe("renderBlock slice resolution", () => {
  test("a marker slice over a two-slice file renders that slice's chart", () => {
    const lines = render(TWO_SLICE_CSV, {
      metric: "b",
      eventType: "weekly-audit",
    });
    assert.equal(
      fenced(lines),
      chartTextFor(TWO_SLICE_CSV, "weekly-audit", "b"),
    );
  });

  test("no slice over a one-slice file renders the chart", () => {
    const csv = makeMetricsCSV("findings", FIFTEEN, "nightly-review");
    assert.equal(
      fenced(render(csv)),
      chartTextFor(csv, "nightly-review", "findings"),
    );
  });

  test("no slice over a two-slice file renders the notice with both values and the token", () => {
    const lines = render(TWO_SLICE_CSV, { metric: "a" });
    assert.deepEqual(lines, [
      "> **XmR block not rendered.** Slice not resolved: several event_type values: nightly-review (15 rows), weekly-audit (15 rows).",
      "> Set `event_type=<slice>` on the marker, or `event_type=*` for all rows.",
    ]);
  });

  test("a named slice absent from the file renders the notice", () => {
    const lines = render(TWO_SLICE_CSV, { metric: "a", eventType: "nope" });
    assert.match(
      lines[0],
      /Slice not resolved: no rows with event_type "nope"/,
    );
    assert.match(
      lines[0],
      /nightly-review \(15 rows\), weekly-audit \(15 rows\)/,
    );
  });

  test("a missing file renders a notice", () => {
    const lines = renderBlock({
      metric: "findings",
      csvPath: "nope.csv",
      projectRoot: ROOT,
      fs: createMockFs({}),
    });
    assert.deepEqual(lines, [
      "> **XmR block not rendered.** Could not read `nope.csv`.",
      "> The marker names a file this wiki cannot read.",
    ]);
  });

  test("a file whose rows all carry an empty value renders a notice", () => {
    const lines = render(
      [METRICS_HEADER, ...metricsRows("findings", [1, 2], "")].join("\n"),
    );
    assert.equal(
      lines[0],
      "> **XmR block not rendered.** Slice not resolved: every row has an empty event_type (2 rows).",
    );
  });

  test("a header-only file renders the no-rows notice", () => {
    const lines = render(METRICS_HEADER);
    assert.deepEqual(lines, [
      "> **XmR block not rendered.** No rows for metric `findings` in slice `* (all rows)`.",
      "> The file holds no rows.",
    ]);
  });

  test("an unknown token renders a notice before any read", () => {
    const lines = renderBlock({
      metric: "findings",
      csvPath: "nope.csv",
      projectRoot: ROOT,
      fs: createMockFs({}),
      tokenErrors: [{ key: "slice", value: "x", reason: "unknown" }],
    });
    assert.deepEqual(lines, [
      "> **XmR block not rendered.** Unknown marker token `slice=x`.",
      "> Known tokens: `event_type=<slice>`, `prior=<YYYY-MM-DD>`.",
    ]);
  });

  test("an unusable prior renders a notice", () => {
    const lines = render(makeMetricsCSV("findings", FIFTEEN), {
      tokenErrors: [{ key: "prior", value: "20260604", reason: "unusable" }],
    });
    assert.equal(
      lines[0],
      "> **XmR block not rendered.** Unusable value for `prior=20260604`.",
    );
  });

  test("two token errors at once put both causes on the line", () => {
    const lines = render(makeMetricsCSV("findings", FIFTEEN), {
      tokenErrors: [
        { key: "slice", value: "x", reason: "unknown" },
        { key: "event_type", value: "b", reason: "repeated" },
      ],
    });
    assert.equal(
      lines[0],
      "> **XmR block not rendered.** Unknown marker token `slice=x`. Repeated marker token `event_type`.",
    );
  });
});

import { test, describe } from "node:test";
import assert from "node:assert";

import { analyze } from "../src/analyze.js";

// Reproduce the #1692 shape: a moderate-variance era with a high cluster early
// (slots 6/7/8 = 9/8/9), then a long favorable zero-run (slots 13..32) that
// tightens the recomputed limits so the early cluster retroactively breaches.
// Slot 12's date is the prior-read anchor: every adverse signal lies wholly in
// pre-anchor history, while the favorable X-Rule 2 zero-run crosses the anchor.
const SHAPE_1692 = [
  2, 3, 2, 3, 2, 9, 8, 9, 3, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
];

// Same date convention as analyze.test.js makeCSV: index i -> 2026-MM-DD with
// day = (i % 28) + 1, month = floor(i / 28) + 1. Slot 12 = index 11 -> 2026-01-12.
function makeCSV(metric, values, { unit = "count" } = {}) {
  const header = "date,metric,value,unit,run,note,event_type";
  const rows = values.map((v, i) => {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
    return `2026-${month}-${day},${metric},${v},${unit},,,kata-shift`;
  });
  return [header, ...rows].join("\n");
}

const ANCHOR_SLOT_12 = "2026-01-12";

function allRecords(signals) {
  return [
    ...signals.xRule1,
    ...signals.xRule2,
    ...signals.xRule3,
    ...signals.mrRule1,
  ];
}

describe("per-signal recomputation-revealed provenance", () => {
  test("adverse pre-anchor signal carries recomputation-revealed (criterion 1)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const m = analyze(csv, { priorReadAnchor: ANCHOR_SLOT_12 }).metrics[0];

    // X-Rule 1 fires on the early cluster (slots 6/7/8), all pre-anchor.
    assert.ok(m.signals.xRule1.length > 0);
    for (const rec of m.signals.xRule1) {
      assert.ok(Math.max(...rec.slots) <= 12);
      assert.strictEqual(rec.provenance, "recomputation-revealed");
    }
  });

  test("favorable post-anchor signal carries new-point, both values in one report (criterion 2)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const m = analyze(csv, { priorReadAnchor: ANCHOR_SLOT_12 }).metrics[0];

    const values = new Set(allRecords(m.signals).map((r) => r.provenance));
    assert.ok(values.has("recomputation-revealed"));
    assert.ok(values.has("new-point"));

    // The post-anchor X-Rule 2 zero-run is the new-point signal.
    const postRun = m.signals.xRule2.find((r) => Math.max(...r.slots) > 12);
    assert.ok(postRun);
    assert.strictEqual(postRun.provenance, "new-point");
  });

  test("no anchor: records carry no provenance key (criterion 3)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const m = analyze(csv).metrics[0];
    for (const rec of allRecords(m.signals)) {
      assert.ok(!("provenance" in rec));
    }
  });

  test("non-corresponding anchor: no provenance, report unchanged (criterion 3)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const baseline = analyze(csv).metrics[0];
    // A date beyond the series end — no slot matches, so the anchor is
    // non-corresponding (spec § Scope: backfill, correction, or beyond end).
    const m = analyze(csv, { priorReadAnchor: "2026-12-31" }).metrics[0];
    for (const rec of allRecords(m.signals)) {
      assert.ok(!("provenance" in rec));
    }
    assert.deepStrictEqual(m.signals, baseline.signals);
  });
});

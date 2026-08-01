import { test, describe } from "node:test";
import assert from "node:assert";

import { analyze } from "../src/analyze.js";

// Reproduce the #1692 shape. The shape is a moderate-variance era with a high
// cluster early (slots 6/7/8 = 9/8/9). A long favorable zero-run follows
// (slots 13..32). The zero-run tightens the recomputed limits. So the early
// cluster breaches retroactively. Slot 12's date is the prior-read anchor.
// Every adverse signal lies wholly in pre-anchor history. The favorable
// X-Rule 2 zero-run crosses the anchor.
const SHAPE_1692 = [
  2, 3, 2, 3, 2, 9, 8, 9, 3, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
];

// The date convention matches makeCSV in analyze.test.js. Index i maps to
// 2026-MM-DD with day = (i % 28) + 1, month = floor(i / 28) + 1. Slot 12 =
// index 11 -> 2026-01-12.
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
  test("an adverse pre-anchor signal carries recomputation-revealed (criterion 1)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const m = analyze(csv, { priorReadAnchor: ANCHOR_SLOT_12 }).metrics[0];

    // X-Rule 1 fires on the early cluster (slots 6/7/8). They are all
    // pre-anchor.
    assert.ok(m.signals.xRule1.length > 0);
    for (const rec of m.signals.xRule1) {
      assert.ok(Math.max(...rec.slots) <= 12);
      assert.strictEqual(rec.provenance, "recomputation-revealed");
    }
  });

  test("a favorable post-anchor signal carries new-point, and one report holds both values (criterion 2)", () => {
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

  test("without an anchor, records carry no provenance key (criterion 3)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const m = analyze(csv).metrics[0];
    for (const rec of allRecords(m.signals)) {
      assert.ok(!("provenance" in rec));
    }
  });

  test("a non-corresponding anchor yields no provenance and leaves the report unchanged (criterion 3)", () => {
    const csv = makeCSV("summary_corrections", SHAPE_1692);
    const baseline = analyze(csv).metrics[0];
    // The date lies beyond the series end. No slot matches. So the anchor is
    // non-corresponding (spec § Scope: backfill, correction, or beyond end).
    const m = analyze(csv, { priorReadAnchor: "2026-12-31" }).metrics[0];
    for (const rec of allRecords(m.signals)) {
      assert.ok(!("provenance" in rec));
    }
    assert.deepStrictEqual(m.signals, baseline.signals);
  });
});

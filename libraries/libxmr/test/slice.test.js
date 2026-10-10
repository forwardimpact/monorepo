import { test, describe } from "node:test";
import assert from "node:assert";

import { parseCSV, CSVIntegrityError } from "../src/csv.js";
import { analyze } from "../src/analyze.js";
import {
  tallySlices,
  resolveReadSlice,
  formatTally,
  analyzeSlice,
  listSliceMetrics,
  SliceResolutionError,
} from "../src/slice.js";
import { HEADER_LINE, MIXED_CSV, SINGLE_CSV } from "./helpers.js";
const tally = (counts, empty = 0) => ({
  counts,
  empty,
  total: Object.values(counts).reduce((a, b) => a + b, 0) + empty,
});

describe("tallySlices", () => {
  test("counts rows per value, keeps the empty count apart, and reports the total", () => {
    const rows = parseCSV(
      [
        HEADER_LINE,
        "2026-01-01,m,1,count,,,a",
        "2026-01-02,m,2,count,,,a",
        "2026-01-03,m,3,count,,,b",
        "2026-01-04,m,4,count,,,",
      ].join("\n"),
    );
    const t = tallySlices(rows);
    assert.deepStrictEqual({ ...t.counts }, { a: 2, b: 1 });
    assert.strictEqual(t.empty, 1);
    assert.strictEqual(t.total, 4);
    assert.ok(!("" in t.counts));
  });

  test("tallies a padded value and a value with a carriage return as one", () => {
    const rows = parseCSV(
      [
        HEADER_LINE,
        "2026-01-01,m,1,count,,, a ",
        "2026-01-02,m,2,count,,,a\r",
        "2026-01-03,m,3,count,,,a",
      ].join("\n"),
    );
    const t = tallySlices(rows);
    assert.deepStrictEqual({ ...t.counts }, { a: 3 });
  });

  test("a header-only file tallies to nothing", () => {
    assert.deepStrictEqual(tallySlices([]), {
      counts: Object.create(null),
      empty: 0,
      total: 0,
    });
  });
});

describe("resolveReadSlice", () => {
  test('no choice on a header-only tally returns "*"', () => {
    assert.strictEqual(resolveReadSlice(undefined, tally({})), "*");
  });

  test("no choice on one value returns it", () => {
    assert.strictEqual(resolveReadSlice(undefined, tally({ a: 3 })), "a");
  });

  test("no choice on one value with empty rows beside it returns the value", () => {
    assert.strictEqual(resolveReadSlice("", tally({ a: 3 }, 2)), "a");
  });

  test("no choice on two values throws and lists both with counts", () => {
    assert.throws(
      () => resolveReadSlice(undefined, tally({ b: 1, a: 3 })),
      (err) => {
        assert.ok(err instanceof SliceResolutionError);
        assert.strictEqual(
          err.message,
          "several event_type values: a (3 rows), b (1 row)",
        );
        return true;
      },
    );
  });

  test("no choice on an only-empty tally throws and names the empty count", () => {
    assert.throws(
      () => resolveReadSlice(undefined, tally({}, 4)),
      (err) => {
        assert.ok(err instanceof SliceResolutionError);
        assert.strictEqual(
          err.message,
          "every row has an empty event_type (4 rows)",
        );
        return true;
      },
    );
  });

  test('"*" returns "*" on any tally', () => {
    assert.strictEqual(resolveReadSlice("*", tally({})), "*");
    assert.strictEqual(resolveReadSlice("*", tally({ a: 1, b: 2 })), "*");
    assert.strictEqual(resolveReadSlice("*", tally({}, 3)), "*");
  });

  test("a present name returns it", () => {
    assert.strictEqual(resolveReadSlice("a", tally({ a: 1, b: 2 })), "a");
  });

  test("an absent name on a non-empty tally throws and lists the values and the empty count", () => {
    assert.throws(
      () => resolveReadSlice("nope", tally({ a: 1, b: 2 }, 1)),
      (err) => {
        assert.ok(err instanceof SliceResolutionError);
        assert.strictEqual(
          err.message,
          'no rows with event_type "nope"; present: a (1 row), b (2 rows); empty: 1 row',
        );
        assert.strictEqual(err.explicit, "nope");
        return true;
      },
    );
  });

  test("an absent name on a header-only tally returns the name", () => {
    assert.strictEqual(resolveReadSlice("nope", tally({})), "nope");
  });

  test('"" and "  " count as no choice', () => {
    assert.strictEqual(resolveReadSlice("", tally({ a: 1 })), "a");
    assert.strictEqual(resolveReadSlice("  ", tally({ a: 1 })), "a");
  });

  test("a padded explicit name resolves as the bare name", () => {
    assert.strictEqual(resolveReadSlice(" a ", tally({ a: 1 })), "a");
  });
});

describe("formatTally", () => {
  test("the singular", () => {
    assert.strictEqual(formatTally(tally({ a: 1 })), "a (1 row)");
  });

  test("the plural, sorted by value", () => {
    assert.strictEqual(
      formatTally(tally({ b: 2, a: 3 })),
      "a (3 rows), b (2 rows)",
    );
  });

  test("the empty suffix", () => {
    assert.strictEqual(
      formatTally(tally({ a: 1 }, 2)),
      "a (1 row); empty: 2 rows",
    );
    assert.strictEqual(formatTally(tally({}, 1)), "empty: 1 row");
  });
});

describe("analyzeSlice", () => {
  test("returns metrics, the resolved eventType, and the tally", () => {
    const r = analyzeSlice(SINGLE_CSV, {});
    assert.strictEqual(r.eventType, "kata-shift");
    assert.strictEqual(r.metrics.length, 1);
    assert.deepStrictEqual(r.metrics[0].values, [100, 101]);
    assert.deepStrictEqual({ ...r.tally.counts }, { "kata-shift": 2 });
    assert.strictEqual(r.tally.total, 2);
  });

  test("an explicit slice over a mixed file reads that slice", () => {
    const r = analyzeSlice(MIXED_CSV, { eventType: "kata-dispatch" });
    assert.strictEqual(r.eventType, "kata-dispatch");
    assert.strictEqual(r.metrics.length, 1);
    assert.strictEqual(r.metrics[0].metric, "dispatch_only");
  });

  test("no slice over a mixed file throws SliceResolutionError", () => {
    assert.throws(() => analyzeSlice(MIXED_CSV, {}), SliceResolutionError);
  });

  test("forwards priorReadAnchor so a signal gains provenance", () => {
    // An early high cluster, then a zero-run that tightens the limits. Slot
    // 12 (2026-01-12) is the anchor, so the cluster's signal predates it.
    const values = [
      2, 3, 2, 3, 2, 9, 8, 9, 3, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ];
    const rows = values.map((v, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      return `2026-${month}-${day},c,${v},count,,,x`;
    });
    const csv = [HEADER_LINE, ...rows].join("\n");
    const m = analyzeSlice(csv, { priorReadAnchor: "2026-01-12" }).metrics[0];
    assert.strictEqual(
      m.signals.xRule1[0].provenance,
      "recomputation-revealed",
    );
  });

  test("forwards route and routesEligibleIncludes like analyze on the same rows", () => {
    const csv = [
      HEADER_LINE,
      '2026-06-20,implementations_shipped,1,count,r1,"route_taken=1; routes_eligible=[1,3]",x',
      '2026-06-21,implementations_shipped,0,count,r2,"route_taken=3; routes_eligible=[3,4]",x',
      '2026-06-22,implementations_shipped,1,count,r3,"route_taken=1; routes_eligible=[1]",x',
    ].join("\n");
    const rows = parseCSV(csv);
    const n = (report) => report.metrics[0]?.n ?? 0;
    assert.strictEqual(
      n(analyzeSlice(csv, { route: "1" })),
      n(analyze(rows, { eventType: "x", route: "1" })),
    );
    assert.strictEqual(n(analyzeSlice(csv, { route: "1" })), 2);
    assert.strictEqual(
      n(analyzeSlice(csv, { routesEligibleIncludes: "4" })),
      n(analyze(rows, { eventType: "x", routesEligibleIncludes: "4" })),
    );
    assert.strictEqual(
      n(analyzeSlice(csv, { routesEligibleIncludes: "4" })),
      1,
    );
  });

  test("a conflict-marker CSV throws CSVIntegrityError", () => {
    const corrupted = [
      HEADER_LINE,
      "2026-06-01,m,1,count,,,x",
      "<<<<<<< HEAD",
      "2026-06-02,m,2,count,,,x",
      "=======",
      "2026-06-02,m,9,count,,,x",
      ">>>>>>> theirs",
    ].join("\n");
    assert.throws(() => analyzeSlice(corrupted, {}), CSVIntegrityError);
  });
});

describe("listSliceMetrics", () => {
  test("returns metrics, eventType, and tally, and infers the sole slice", () => {
    const r = listSliceMetrics(SINGLE_CSV, {});
    assert.strictEqual(r.eventType, "kata-shift");
    assert.strictEqual(r.metrics.length, 1);
    assert.strictEqual(r.metrics[0].metric, "shift_only");
    assert.strictEqual(r.metrics[0].n, 2);
    assert.strictEqual(r.tally.total, 2);
  });

  test("a conflict-marker CSV throws CSVIntegrityError", () => {
    const corrupted = [HEADER_LINE, "<<<<<<< HEAD", "=======", ">>>>>>> x"];
    assert.throws(
      () => listSliceMetrics(corrupted.join("\n"), { eventType: "*" }),
      CSVIntegrityError,
    );
  });
});

describe("SliceResolutionError", () => {
  test("carries explicit and tally, and its message holds no flag or token text", () => {
    const t = tally({ a: 1, b: 1 });
    try {
      resolveReadSlice(undefined, t);
      assert.fail("expected SliceResolutionError");
    } catch (err) {
      assert.strictEqual(err.name, "SliceResolutionError");
      assert.strictEqual(err.explicit, null);
      assert.strictEqual(err.tally, t);
      assert.doesNotMatch(err.message, /--event-type|event_type=/);
    }
  });
});

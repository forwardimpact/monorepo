import { test, describe } from "node:test";
import assert from "node:assert";

import {
  parseCSV,
  parseLine,
  validateCSV,
  listMetrics,
  CSVIntegrityError,
} from "../src/csv.js";

const HEADER_LINE = "date,metric,value,unit,run,note,event_type";

describe("conflict-marker guard", () => {
  // Corruption shape observed in the field: both conflict branches interleaved among valid rows.
  const MERGE_CONFLICT = [
    HEADER_LINE,
    "2026-06-01,m,1,count,r1,,kata-shift",
    "<<<<<<< HEAD",
    "2026-06-02,m,2,count,r2,,kata-shift",
    "=======",
    "2026-06-02,m,9,count,r2x,,kata-shift",
    ">>>>>>> theirs",
    "2026-06-03,m,3,count,r3,,kata-shift",
  ].join("\n");

  // Autostash specimen shape (wiki sync rebase round on 2026-06-12).
  const AUTOSTASH = [
    HEADER_LINE,
    "<<<<<<< Updated upstream",
    "2026-06-12,words,100,count,,,kata-shift",
    "=======",
    "2026-06-12,words,90,count,,,kata-shift",
    ">>>>>>> Stashed changes",
  ].join("\n");

  test("parseCSV throws CSVIntegrityError on a merge-conflict CSV", () => {
    assert.throws(() => parseCSV(MERGE_CONFLICT), CSVIntegrityError);
  });

  test("error carries the first marker's line number and content", () => {
    try {
      parseCSV(MERGE_CONFLICT);
      assert.fail("expected CSVIntegrityError");
    } catch (err) {
      assert.strictEqual(err.name, "CSVIntegrityError");
      assert.strictEqual(err.line, 3);
      assert.strictEqual(err.content, "<<<<<<< HEAD");
      assert.match(err.message, /line 3/);
      assert.match(err.message, /<<<<<<< HEAD/);
    }
  });

  test("parseCSV throws on the autostash specimen", () => {
    assert.throws(
      () => parseCSV(AUTOSTASH),
      (err) => {
        assert.ok(err instanceof CSVIntegrityError);
        assert.strictEqual(err.line, 2);
        assert.strictEqual(err.content, "<<<<<<< Updated upstream");
        return true;
      },
    );
  });

  test("listMetrics throws on a corrupted CSV", () => {
    assert.throws(() => listMetrics(MERGE_CONFLICT, "*"), CSVIntegrityError);
  });

  test("a bare separator line alone is rejected", () => {
    const csv = [
      HEADER_LINE,
      "2026-06-01,m,1,count,,,kata-shift",
      "=======",
    ].join("\n");
    assert.throws(() => parseCSV(csv), CSVIntegrityError);
  });

  test("marker-like text inside a field does not trip the anchor", () => {
    const csv = [
      HEADER_LINE,
      '2026-06-01,m,1,count,,"diff showed ======= and >>>>>>> ours",kata-shift',
      "2026-06-02,m,2,count,,note with <<<<<<< inside,kata-shift",
    ].join("\n");
    const rows = parseCSV(csv);
    assert.strictEqual(rows.length, 2);
  });

  test("an eight-equals divider line is not a conflict marker", () => {
    const csv = [
      HEADER_LINE,
      "2026-06-01,m,1,count,,,kata-shift",
      "========",
    ].join("\n");
    const rows = parseCSV(csv);
    assert.strictEqual(rows.length, 2);
  });
});

describe("parseCSV", () => {
  test("parses a simple CSV", () => {
    const text = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
      '2026-01-02,bugs,5,count,https://example.com,"has, comma",kata-shift',
    ].join("\n");

    const rows = parseCSV(text);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].metric, "bugs");
    assert.strictEqual(rows[0].value, 3);
    assert.strictEqual(rows[0].note, "");
    assert.strictEqual(rows[0].eventType, "kata-shift");
    assert.strictEqual(rows[1].note, "has, comma");
  });

  test("returns empty array for header-only CSV", () => {
    assert.deepStrictEqual(
      parseCSV("date,metric,value,unit,run,note,event_type"),
      [],
    );
  });

  test("returns empty array for empty text", () => {
    assert.deepStrictEqual(parseCSV(""), []);
  });
});

describe("parseLine", () => {
  test("parses a simple line", () => {
    const row = parseLine(
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
    );
    assert.strictEqual(row.date, "2026-01-01");
    assert.strictEqual(row.metric, "bugs");
    assert.strictEqual(row.value, 3);
    assert.strictEqual(row.unit, "count");
    assert.strictEqual(row.eventType, "kata-shift");
  });

  test("defaults eventType to empty string on a six-field line", () => {
    const row = parseLine("2026-01-01,bugs,3,count,https://example.com,");
    assert.strictEqual(row.eventType, "");
  });

  test("respects quoted fields containing commas", () => {
    const row = parseLine(
      '2026-01-01,bugs,3,count,https://example.com,"has, comma"',
    );
    assert.strictEqual(row.note, "has, comma");
  });

  test("exposes raw fields for callers that need lossless access", () => {
    const row = parseLine("2026-01-01,bugs,abc,count,,");
    assert.strictEqual(Number.isNaN(row.value), true);
    assert.strictEqual(row.raw.fields[2], "abc");
  });
});

describe("validateCSV", () => {
  test("accepts valid CSV", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.rows, 1);
    assert.strictEqual(result.errors.length, 0);
  });

  test("rejects wrong header with a column diff", () => {
    const csv = "date,metric,value,unit,run,note\n2026-01-01,bugs,3,count,,";
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].message.includes("header mismatch"));
    // `host_run` belongs to COLUMNS, so the column diff lists both
    // trailing columns as missing from this 6-column header.
    assert.ok(
      result.errors[0].message.includes("missing=[event_type,host_run]"),
    );
  });

  test("accepts the 8-column header with host_run", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type,host_run",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift,27401632821",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test("accepts the legacy 7-column header", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test("rejects non-numeric value", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,abc,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "value"));
  });

  test("rejects invalid date", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "not-a-date,bugs,3,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "date"));
  });

  test("rejects empty file with a clear message", () => {
    const result = validateCSV("");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].message.includes("empty"));
  });

  test("rejects missing header on a non-empty file", () => {
    const result = validateCSV("not a header line");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].message.includes("header mismatch"));
  });

  test("rejects a row with empty event_type, naming line and field", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
      "2026-01-02,bugs,4,count,https://example.com,,",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    const err = result.errors.find((e) => e.field === "event_type");
    assert.ok(err);
    assert.strictEqual(err.line, 3);
    assert.strictEqual(err.message, "missing event_type");
  });

  test("rejects a six-field row missing the event_type column", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "event_type"));
  });
});

describe("listMetrics", () => {
  const inventoryCsv = [
    "date,metric,value,unit,run,note,event_type",
    "2026-01-01,a,1,count,r,,kata-shift",
    "2026-01-02,a,2,count,r,,kata-shift",
    "2026-01-01,b,5,days,r,,kata-dispatch",
  ].join("\n");

  test("returns metric inventory for the default kata-shift slice", () => {
    const metrics = listMetrics(inventoryCsv);

    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].metric, "a");
    assert.strictEqual(metrics[0].n, 2);
    assert.strictEqual(metrics[0].from, "2026-01-01");
    assert.strictEqual(metrics[0].to, "2026-01-02");
  });

  test("filters to one event_type when given", () => {
    const metrics = listMetrics(inventoryCsv, "kata-dispatch");
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].metric, "b");
  });

  test('treats "*" as no filter', () => {
    const metrics = listMetrics(inventoryCsv, "*");
    assert.strictEqual(metrics.length, 2);
    assert.strictEqual(metrics[1].unit, "days");
  });
});

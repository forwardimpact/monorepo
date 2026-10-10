import { test, describe } from "node:test";
import assert from "node:assert";

import {
  parseCSV,
  parseLine,
  validateCSV,
  normalizeSlice,
  CSVIntegrityError,
} from "../src/csv.js";
import { HEADER_LINE } from "./helpers.js";

describe("conflict-marker guard", () => {
  // This corruption shape comes from the field. Both conflict branches
  // interleave among valid rows.
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

  // The autostash specimen shape comes from the wiki-sync rebase round on
  // 2026-06-12.
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

  test("the error carries the first marker's line number and content", () => {
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

  test("parseCSV rejects a bare separator line alone", () => {
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

  test("returns an empty array for a header-only CSV", () => {
    assert.deepStrictEqual(
      parseCSV("date,metric,value,unit,run,note,event_type"),
      [],
    );
  });

  test("returns an empty array for empty text", () => {
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

  test("defaults eventType to an empty string on a six-field line", () => {
    const row = parseLine("2026-01-01,bugs,3,count,https://example.com,");
    assert.strictEqual(row.eventType, "");
  });

  test("respects quoted fields that contain commas", () => {
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

  test("strips one trailing carriage return before the split", () => {
    const row = parseLine("2026-01-01,bugs,3,count,,,kata-shift,124\r");
    assert.strictEqual(row.eventType, "kata-shift");
    assert.strictEqual(row.hostRun, "124");
    assert.strictEqual(row.raw.fields.length, 8);
  });

  test("normalises the event_type cell by trimming surrounding whitespace", () => {
    const row = parseLine("2026-01-01,bugs,3,count,,, x ");
    assert.strictEqual(row.eventType, "x");
  });
});

describe("normalizeSlice", () => {
  test("trims a padded string", () => {
    assert.strictEqual(normalizeSlice("  kata-shift \r"), "kata-shift");
  });

  test('returns "" for a non-string', () => {
    assert.strictEqual(normalizeSlice(undefined), "");
    assert.strictEqual(normalizeSlice(null), "");
    assert.strictEqual(normalizeSlice(3), "");
  });
});

describe("validateCSV", () => {
  test("accepts a valid CSV", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.rows, 1);
    assert.strictEqual(result.errors.length, 0);
  });

  test("rejects a wrong header with a column diff", () => {
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

  test("rejects a non-numeric value", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,abc,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "value"));
  });

  test("rejects an invalid date", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "not-a-date,bugs,3,count,https://example.com,,kata-shift",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "date"));
  });

  test("rejects an empty file with a clear message", () => {
    const result = validateCSV("");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].message.includes("empty"));
  });

  test("rejects a missing header on a non-empty file", () => {
    const result = validateCSV("not a header line");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].message.includes("header mismatch"));
  });

  test("rejects a row with an empty event_type and names the line and field", () => {
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

  test("rejects a six-field row with both the missing event_type and the field count", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,https://example.com,",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.find((e) => e.field === "event_type"));
    const count = result.errors.find((e) => e.field === "row");
    assert.ok(count);
    assert.match(count.message, /field count 6/);
  });

  // The shifted-row fixture: an unquoted comma in `note`
  // pushes every later field one slot right, so the row parses with nine
  // fields and `validate` must say so.
  test("rejects a row whose field count is outside the schema range", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type,host_run",
      "2026-01-02,widgets,2,count,,note with a comma, which shifts everything,kata-shift,124",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, false);
    const err = result.errors.find((e) => e.field === "row");
    assert.ok(err);
    assert.strictEqual(err.line, 2);
    assert.match(err.message, /7 to 8/);
    assert.match(err.message, /field count 9/);
  });

  test("accepts seven-field and eight-field rows under the legacy header", () => {
    const csv = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,bugs,3,count,,,kata-shift",
      "2026-01-02,bugs,4,count,,,kata-shift,27401632821",
    ].join("\n");
    const result = validateCSV(csv);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.rows, 2);
  });
});

describe("route-decision context", () => {
  test("parseLine stamps route fields from the note grammar", () => {
    const row = parseLine(
      '2026-06-20,implementations_shipped,0,count,run-1,"route_taken=3; routes_eligible=[3,4]; tail",kata-shift',
    );
    assert.strictEqual(row.routeTaken, "3");
    assert.deepStrictEqual(row.routesEligible, ["3", "4"]);
  });

  test("parseLine leaves route fields empty for a plain note", () => {
    const row = parseLine(
      "2026-04-14,implementations_shipped,4,count,gh-backfill,merged PRs,kata-shift",
    );
    assert.strictEqual(row.routeTaken, "");
    assert.deepStrictEqual(row.routesEligible, []);
  });

  test("validate rejects a post-convention route-bearing row with no route", () => {
    const csv = [
      HEADER_LINE,
      "2026-06-20,implementations_shipped,0,count,run-1,no grammar here,kata-shift",
    ].join("\n");
    const { valid, errors } = validateCSV(csv);
    assert.strictEqual(valid, false);
    assert.ok(errors.some((e) => e.field === "route_taken" && e.line === 2));
  });

  test("validate rejects an unknown route on a post-convention row", () => {
    const csv = [
      HEADER_LINE,
      '2026-06-20,implementations_shipped,0,count,run-1,"route_taken=9; routes_eligible=[]",kata-shift',
    ].join("\n");
    const { valid, errors } = validateCSV(csv);
    assert.strictEqual(valid, false);
    assert.ok(
      errors.some(
        (e) => e.field === "route_taken" && /unknown route/.test(e.message),
      ),
    );
  });

  test("validate leaves pre-convention route-bearing rows valid", () => {
    const csv = [
      HEADER_LINE,
      "2026-06-05,implementations_shipped,0,count,run-1,no grammar,kata-shift",
    ].join("\n");
    assert.strictEqual(validateCSV(csv).valid, true);
  });

  test("validate ignores route context on non-route-bearing metrics", () => {
    const csv = [
      HEADER_LINE,
      "2026-06-20,specs_drafted,1,count,run-1,plain note,kata-shift",
    ].join("\n");
    assert.strictEqual(validateCSV(csv).valid, true);
  });
});

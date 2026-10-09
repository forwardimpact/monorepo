import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";
import { runListCommand } from "../src/commands/list.js";
import { makeRuntime, ctxFor, MIXED_CSV, SINGLE_CSV } from "./helpers.js";

const CSV_PATH = "/metrics/metrics.csv";

function runList(options = {}, content = MIXED_CSV) {
  const fsSync = createMockFs({ [CSV_PATH]: content });
  const rt = makeRuntime({ fsSync });
  const ctx = ctxFor({
    runtime: rt.runtime,
    options,
    args: { "csv-path": CSV_PATH },
  });
  const result = runListCommand(ctx);
  return { result, stdout: rt.stdout, stderr: rt.stderr };
}

describe("list command", () => {
  test("resolves the sole slice and names it", () => {
    const { result, stdout } = runList({}, SINGLE_CSV);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(stdout, /event_type: kata-shift/);
    assert.match(stdout, /shift_only/);
  });

  test("--event-type kata-dispatch lists the dispatch slice", () => {
    const { stdout } = runList({ "event-type": "kata-dispatch" });
    assert.match(stdout, /event_type: kata-dispatch/);
    assert.match(stdout, /dispatch_only/);
    assert.ok(!stdout.includes("shift_only"));
  });

  // `*` on a multi-slice file lists every metric and exits 0.
  test('--event-type "*" lists all rows and names the slice', () => {
    const { result, stdout } = runList({ "event-type": "*" });
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(stdout, /event_type: \* \(all rows\)/);
    assert.match(stdout, /shift_only/);
    assert.match(stdout, /dispatch_only/);
  });

  test("json output carries the inferred slice", () => {
    const { stdout } = runList({ format: "json" }, SINGLE_CSV);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.event_type, "kata-shift");
    assert.strictEqual(parsed.metrics.length, 1);
  });

  test('json output carries the machine value "*" when no filter applies', () => {
    const { stdout } = runList({ format: "json", "event-type": "*" });
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.event_type, "*");
    assert.strictEqual(parsed.metrics.length, 2);
  });

  // Rows exist, but none names a stream. A flag-free read must not treat
  // them as an empty report.
  test("a file whose rows all carry an empty value fails and names the row count", () => {
    const allEmpty = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,m,1,count,,,",
      "2026-01-02,m,2,count,,,",
      "2026-01-03,m,3,count,,,",
    ].join("\n");
    const { result, stdout } = runList({}, allEmpty);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 2);
    assert.match(result.error, /every row has an empty event_type \(3 rows\)/);
    assert.strictEqual(stdout, "");
  });

  // A value with a trailing carriage return is the same slice as the
  // bare value, so the file resolves to one slice with every row counted.
  test("a trailing carriage return does not split one slice into two", () => {
    const crlf = [
      "date,metric,value,unit,run,note,event_type",
      "2026-01-01,m,1,count,,,x",
      "2026-01-02,m,2,count,,,x\r",
      "2026-01-03,m,3,count,,,x\r",
    ].join("\n");
    const { result, stdout } = runList({ format: "json" }, crlf);
    assert.ok(result.ok, JSON.stringify(result));
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.event_type, "x");
    assert.strictEqual(parsed.metrics.length, 1);
    assert.strictEqual(parsed.metrics[0].n, 3);
  });

  test("a header-only file is an empty report", () => {
    const { result, stdout } = runList(
      { format: "json" },
      "date,metric,value,unit,run,note,event_type",
    );
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(JSON.parse(stdout).metrics, []);
  });

  test("a missing file returns an error envelope", () => {
    const fsSync = createMockFs({});
    const rt = makeRuntime({ fsSync });
    const ctx = ctxFor({
      runtime: rt.runtime,
      options: {},
      args: { "csv-path": "/nope.csv" },
    });
    const result = runListCommand(ctx);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 2);
  });
});

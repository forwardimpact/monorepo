import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";
import { runListCommand } from "../src/commands/list.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const CSV_PATH = "/metrics/metrics.csv";

const MIXED = [
  "date,metric,value,unit,run,note,event_type",
  "2026-01-01,shift_only,1,count,,,kata-shift",
  "2026-01-02,shift_only,2,count,,,kata-shift",
  "2026-01-01,dispatch_only,1,count,,,kata-dispatch",
].join("\n");

function runList(options = {}, content = MIXED) {
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
  test("defaults to the kata-shift slice and names it", () => {
    const { result, stdout } = runList();
    assert.ok(result.ok);
    assert.match(stdout, /event_type: kata-shift/);
    assert.match(stdout, /shift_only/);
    assert.ok(!stdout.includes("dispatch_only"));
  });

  test("--event-type kata-dispatch lists the dispatch slice", () => {
    const { stdout } = runList({ "event-type": "kata-dispatch" });
    assert.match(stdout, /event_type: kata-dispatch/);
    assert.match(stdout, /dispatch_only/);
    assert.ok(!stdout.includes("shift_only"));
  });

  test('--event-type "*" lists all rows and names the slice', () => {
    const { stdout } = runList({ "event-type": "*" });
    assert.match(stdout, /event_type: \* \(all rows\)/);
    assert.match(stdout, /shift_only/);
    assert.match(stdout, /dispatch_only/);
  });

  test("json output carries the slice", () => {
    const { stdout } = runList({ format: "json" });
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.event_type, "kata-shift");
    assert.strictEqual(parsed.metrics.length, 1);
  });

  test('json output carries the machine value "*" when unfiltered', () => {
    const { stdout } = runList({ format: "json", "event-type": "*" });
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.event_type, "*");
    assert.strictEqual(parsed.metrics.length, 2);
  });

  test("missing file returns an error envelope", () => {
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

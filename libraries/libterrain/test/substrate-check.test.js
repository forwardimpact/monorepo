/**
 * `substrate check` probes each contract relation with a column-explicit
 * select; severity follows the relation's required flag, not the failure
 * kind.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runSubstrateCheck } from "../src/commands/substrate-check.js";

function makeProbeStub(errorsByTable = {}) {
  const selects = [];
  return {
    selects,
    from(table) {
      return {
        select(columns) {
          selects.push({ table, columns });
          return {
            limit: () =>
              Promise.resolve(
                errorsByTable[table]
                  ? { data: null, error: errorsByTable[table] }
                  : { data: [], error: null },
              ),
          };
        },
      };
    },
  };
}

function stderrText(runtime) {
  return runtime.proc.stderr.chunks.join("");
}

function stdoutText(runtime) {
  return runtime.proc.stdout.chunks.join("");
}

describe("substrate check", () => {
  test("passes when every relation answers the column-explicit probe", async () => {
    const supabase = makeProbeStub();
    const runtime = createTestRuntime();
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 0);
    assert.match(stdoutText(runtime), /Substrate Contract satisfied/);
    // Column-explicit — never select("*").
    const peopleProbe = supabase.selects.find((s) => s.table === "people");
    assert.match(peopleProbe.columns, /email,name,kind/);
    assert.notEqual(peopleProbe.columns, "*");
    assert.deepEqual(supabase.selects.map((s) => s.table).sort(), [
      "discovery",
      "evidence",
      "people",
    ]);
  });

  test("required relation missing fails with a diagnostic", async () => {
    const supabase = makeProbeStub({
      people: { code: "PGRST205", message: "table people not found" },
    });
    const runtime = createTestRuntime();
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 1);
    assert.match(
      stderrText(runtime),
      /substrate\.people \(required\): table people not found/,
    );
  });

  test("required relation malformed (missing column) fails", async () => {
    const supabase = makeProbeStub({
      people: { code: "42703", message: "column people.track does not exist" },
    });
    const runtime = createTestRuntime();
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 1);
    assert.match(stderrText(runtime), /column people\.track does not exist/);
  });

  test("optional relation missing reports info and exits 0", async () => {
    const supabase = makeProbeStub({
      evidence: { code: "PGRST205", message: "table evidence not found" },
      discovery: { code: "PGRST205", message: "table discovery not found" },
    });
    const runtime = createTestRuntime();
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 0);
    const out = stdoutText(runtime);
    assert.match(out, /info: substrate\.evidence \(optional\)/);
    assert.match(out, /info: substrate\.discovery \(optional\)/);
    assert.match(out, /degrades declaredly/);
  });

  test("optional malformed also stays info (severity follows required flag)", async () => {
    const supabase = makeProbeStub({
      evidence: { code: "42703", message: "column evidence.email missing" },
    });
    const runtime = createTestRuntime();
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 0);
    assert.match(stdoutText(runtime), /info: substrate\.evidence \(optional\)/);
  });
});

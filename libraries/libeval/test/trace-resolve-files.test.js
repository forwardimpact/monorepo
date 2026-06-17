import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";
import { runPathsCommand } from "../src/commands/trace.js";

// `resolveFiles` is module-private; exercise its two branches (literal-path
// pass-through vs glob expansion via runtime.fsSync.globSync) and the
// no-files envelope through the `paths` handler, which is the cross-trace verb
// with the simplest output. A single-turn fixture with one Read keeps the
// assertion focused on file resolution, not analysis.
const A = "/d/a.ndjson";
const B = "/d/b.ndjson";

function traceBody(path) {
  return (
    [
      { type: "system", subtype: "init", tools: ["Read"] },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Read",
              input: { file_path: path },
            },
          ],
        },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n"
  );
}

/**
 * Run `paths` with the given options over a mock fs, capturing stdout.
 * `globSync` is provided as a spy returning `globReturn` so the glob branch is
 * observable without a real filesystem.
 */
async function run(options, { globReturn } = {}) {
  const fsSync = createMockFs({ [A]: traceBody("/x"), [B]: traceBody("/y") });
  const globCalls = [];
  fsSync.globSync = (pattern) => {
    globCalls.push(pattern);
    return globReturn ?? [];
  };
  let out = "";
  const result = await runPathsCommand({
    options,
    args: {},
    deps: {
      runtime: {
        fsSync,
        proc: { stdout: { write: (s) => (out += s) } },
        clock: { now: () => 0 },
      },
    },
  });
  return { out, result, globCalls };
}

describe("resolveFiles (via paths handler)", () => {
  test("literal path passes through without calling globSync", async () => {
    const { out, result, globCalls } = await run({ file: [A] });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(globCalls.length, 0);
    assert.ok(out.includes("/x")); // single-file: no source prefix
    assert.ok(!out.includes("a.ndjson:"));
  });

  test("multiple literal --file values aggregate with sources provenance", async () => {
    // `paths` is an aggregator: provenance is the JSON `sources` array (the
    // design's "Aggregated sources plurality" decision), present only when N>1.
    const { out, globCalls } = await run({ file: [A, B], format: "json" });
    assert.strictEqual(globCalls.length, 0);
    const records = JSON.parse(out);
    const x = records.find((r) => r.path === "/x");
    const y = records.find((r) => r.path === "/y");
    assert.deepStrictEqual(x.sources, ["a.ndjson"]);
    assert.deepStrictEqual(y.sources, ["b.ndjson"]);
  });

  test("glob value expands via runtime.fsSync.globSync", async () => {
    const { out, globCalls } = await run(
      { file: ["/d/*.ndjson"], format: "json" },
      { globReturn: [A, B] },
    );
    assert.deepStrictEqual(globCalls, ["/d/*.ndjson"]);
    const records = JSON.parse(out);
    assert.deepStrictEqual(records.map((r) => r.path).sort(), ["/x", "/y"]);
    // Both files resolved from one glob → multi → sources present.
    assert.ok(records.every((r) => Array.isArray(r.sources)));
  });

  test("zero files returns the no-files error envelope", async () => {
    const { result } = await run({});
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /no files/);
  });
});

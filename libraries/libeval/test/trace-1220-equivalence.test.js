import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockFs } from "@forwardimpact/libmock";

import {
  runOverviewCommand,
  runHeadCommand,
  runTailCommand,
  runToolsCommand,
  runErrorsCommand,
  runReasoningCommand,
  runInitCommand,
  runFilterCommand,
  runToolCommand,
  runTurnCommand,
  runBatchCommand,
  runStatsCommand,
} from "../src/commands/trace.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureFile = join(here, "fixtures", "trace-1220.ndjson");
const fixtureDir = join(here, "fixtures", "trace-query-1220");
const fixtureBody = readFileSync(fixtureFile, "utf8");

// Seed the fixture under a literal path in a mock fs (resolveFiles never calls
// globSync for a literal path, so the mock needs no glob stub), then hand-build
// the InvocationContext the handler consumes — the package's established
// handler-test pattern (trace-cost.test.js). createDefaultRuntime() is unusable
// here because its frozen proc.stdout forwards to the real stdout.
const FILE = "/fixtures/trace-1220.ndjson";

/**
 * Invoke a handler over the seeded fixture and capture stdout.
 * @param {Function} handler
 * @param {object} options - Parsed flag values (merged with format: "json").
 * @param {object} [args] - Named positionals.
 * @returns {Promise<string>} Captured stdout.
 */
async function capture(handler, options, args = {}) {
  const fsSync = createMockFs({ [FILE]: fixtureBody });
  let out = "";
  await handler({
    options: { format: "json", ...options },
    args,
    deps: {
      runtime: { fsSync, proc: { stdout: { write: (s) => (out += s) } } },
    },
  });
  return out;
}

/**
 * Capture a cross-trace handler (file via --file) under --format json, parse it
 * and the committed baseline fixture, and assert deep structural equality.
 */
async function assertEquivalentMulti(handler, name, options = {}) {
  const actual = JSON.parse(
    await capture(handler, { file: [FILE], ...options }),
  );
  const expected = JSON.parse(
    readFileSync(join(fixtureDir, `${name}.json`), "utf8"),
  );
  assert.deepStrictEqual(actual, expected);
}

/**
 * Same as above for a single-file verb whose file is a positional in args.
 */
async function assertEquivalentArgs(handler, name, args) {
  const actual = JSON.parse(
    await capture(handler, {}, { file: FILE, ...args }),
  );
  const expected = JSON.parse(
    readFileSync(join(fixtureDir, `${name}.json`), "utf8"),
  );
  assert.deepStrictEqual(actual, expected);
}

describe("spec 1220 structural-equivalence", () => {
  test("overview", () => assertEquivalentMulti(runOverviewCommand, "overview"));
  test("head (--lines 10)", () =>
    assertEquivalentMulti(runHeadCommand, "head", { lines: "10" }));
  test("tail (--lines 10)", () =>
    assertEquivalentMulti(runTailCommand, "tail", { lines: "10" }));
  test("tools", () => assertEquivalentMulti(runToolsCommand, "tools"));
  test("errors", () => assertEquivalentMulti(runErrorsCommand, "errors"));
  test("reasoning", () =>
    assertEquivalentMulti(runReasoningCommand, "reasoning"));
  test("init", () => assertEquivalentMulti(runInitCommand, "init"));
  test("filter", () => assertEquivalentMulti(runFilterCommand, "filter"));
  test("tool (Bash)", () =>
    assertEquivalentArgs(runToolCommand, "tool", { name: "Bash" }));
  test("turn (3)", () =>
    assertEquivalentArgs(runTurnCommand, "turn", { index: "3" }));
  test("batch (0,3)", () =>
    assertEquivalentArgs(runBatchCommand, "batch", { from: "0", to: "3" }));
  test("stats", () => assertEquivalentMulti(runStatsCommand, "stats"));

  test("--signatures controls thinking-signature inclusion under --format json", async () => {
    const stripped = await capture(runFilterCommand, { file: [FILE] });
    const kept = await capture(runFilterCommand, {
      file: [FILE],
      signatures: true,
    });
    assert.ok(!stripped.includes("signaturebase64blob"));
    assert.ok(kept.includes("signaturebase64blob"));
  });

  test("stats --by-tool token sums equal un-flagged totals", async () => {
    const plain = JSON.parse(await capture(runStatsCommand, { file: [FILE] }));
    const byTool = JSON.parse(
      await capture(runStatsCommand, { file: [FILE], "by-tool": true }),
    );
    const sumIn = byTool.perTool.reduce((s, b) => s + b.inputTokens, 0);
    const sumOut = byTool.perTool.reduce((s, b) => s + b.outputTokens, 0);
    assert.strictEqual(Math.round(sumIn), plain.totals.inputTokens);
    assert.strictEqual(Math.round(sumOut), plain.totals.outputTokens);
    const shareSum = byTool.perTool.reduce((s, b) => s + b.costShare, 0);
    assert.strictEqual(shareSum, 1.0);
  });

  test("stats --summary omits perTurn", async () => {
    const out = JSON.parse(
      await capture(runStatsCommand, { file: [FILE], summary: true }),
    );
    assert.ok(out.totals);
    assert.strictEqual(out.perTurn, undefined);
  });
});

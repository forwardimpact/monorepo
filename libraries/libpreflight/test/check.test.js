import { describe, test } from "node:test";
import assert from "node:assert";
import { check } from "../src/check.js";

function makeProcess(nodeVersion) {
  const stderrCalls = [];
  const exitCalls = [];
  return {
    versions: { node: nodeVersion },
    stderr: {
      write: (chunk) => {
        stderrCalls.push(chunk);
        return true;
      },
    },
    exit: (code) => {
      exitCalls.push(code);
    },
    stderrCalls,
    exitCalls,
  };
}

describe("libpreflight check(22)", () => {
  test("returns silently when major satisfies floor", () => {
    const proc = makeProcess("22.0.0");
    check(22, proc);
    assert.deepStrictEqual(proc.stderrCalls, []);
    assert.deepStrictEqual(proc.exitCalls, []);
  });

  test("writes the two-line failure and exits 1 on Node 20", () => {
    const proc = makeProcess("20.11.0");
    check(22, proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      "Error: This command requires Node.js 22 or later (running 20.11.0).\n",
      "Install Node.js 22 (LTS) from https://nodejs.org/ and re-run.\n",
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });

  test("echoes the detected version on Node 18", () => {
    const proc = makeProcess("18.20.0");
    check(22, proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      "Error: This command requires Node.js 22 or later (running 18.20.0).\n",
      "Install Node.js 22 (LTS) from https://nodejs.org/ and re-run.\n",
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });
});

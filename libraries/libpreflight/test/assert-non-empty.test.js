import { describe, test } from "node:test";
import assert from "node:assert";
import { assertNonEmpty } from "../src/assert-non-empty.js";

function makeProcess() {
  const stderrCalls = [];
  const exitCalls = [];
  return {
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

describe("libpreflight assertNonEmpty", () => {
  test("returns silently on a non-empty string", () => {
    const proc = makeProcess();
    assertNonEmpty("https://github.com", "idp_origin", proc);
    assert.deepStrictEqual(proc.stderrCalls, []);
    assert.deepStrictEqual(proc.exitCalls, []);
  });

  test("returns silently on a populated array", () => {
    const proc = makeProcess();
    assertNonEmpty(["a"], "trusted_idp_origins", proc);
    assert.deepStrictEqual(proc.stderrCalls, []);
    assert.deepStrictEqual(proc.exitCalls, []);
  });

  test("returns silently on a populated Set", () => {
    const proc = makeProcess();
    assertNonEmpty(new Set(["https://github.com"]), "trusted (loaded)", proc);
    assert.deepStrictEqual(proc.stderrCalls, []);
    assert.deepStrictEqual(proc.exitCalls, []);
  });

  test("writes labelled error and exits 1 on empty string", () => {
    const proc = makeProcess();
    assertNonEmpty("", "idp_origin", proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      'Error: required configuration "idp_origin" is empty.\n',
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });

  test("writes labelled error and exits 1 on empty array", () => {
    const proc = makeProcess();
    assertNonEmpty([], "trusted_idp_origins", proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      'Error: required configuration "trusted_idp_origins" is empty.\n',
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });

  test("writes labelled error and exits 1 on empty Set", () => {
    const proc = makeProcess();
    assertNonEmpty(new Set(), "trusted_idp_origins (loaded)", proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      'Error: required configuration "trusted_idp_origins (loaded)" is empty.\n',
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });

  test("writes labelled error and exits 1 on undefined", () => {
    const proc = makeProcess();
    assertNonEmpty(undefined, "secret", proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      'Error: required configuration "secret" is empty.\n',
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });

  test("writes labelled error and exits 1 on null", () => {
    const proc = makeProcess();
    assertNonEmpty(null, "secret", proc);
    assert.deepStrictEqual(proc.stderrCalls, [
      'Error: required configuration "secret" is empty.\n',
    ]);
    assert.deepStrictEqual(proc.exitCalls, [1]);
  });
});

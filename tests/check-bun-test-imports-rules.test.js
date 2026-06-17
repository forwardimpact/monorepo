import { describe, test } from "bun:test";
import assert from "node:assert/strict";

import { bunTestFindings } from "../scripts/check-bun-test-imports-rules.mjs";

const only = (src, isTestFile) => {
  const findings = bunTestFindings(src, isTestFile);
  assert.equal(findings.length, 1, `expected one finding for: ${src}`);
  return findings[0];
};

describe("check-bun-test-imports allowlist rules", () => {
  // (i) named import of an allowlisted symbol — clean.
  test("allows a named allowlisted import in a test file", () => {
    assert.deepEqual(
      bunTestFindings(`import { describe } from "bun:test";`, true),
      [],
    );
  });

  // (ii) renamed import of an allowlisted symbol — clean.
  test("allows a renamed allowlisted import in a test file", () => {
    assert.deepEqual(
      bunTestFindings(`import { test as t } from "bun:test";`, true),
      [],
    );
  });

  // (iii) named import of a banned symbol — rejected on the imported name.
  test("rejects a banned named import with a symbol finding", () => {
    const f = only(`import { spyOn } from "bun:test";`, true);
    assert.equal(f.kind, "symbol");
    assert.equal(f.name, "spyOn");
    assert.ok(f.pointer && f.pointer.length > 0);
  });

  // (iv) renamed import of a banned symbol — rejected on the imported side.
  test("rejects a renamed banned import on the imported name", () => {
    const f = only(`import { spyOn as track } from "bun:test";`, true);
    assert.equal(f.kind, "symbol");
    assert.equal(f.name, "spyOn");
  });

  // (v.a) default import.
  test("rejects a default import as a shape finding", () => {
    const f = only(`import x from "bun:test";`, true);
    assert.equal(f.kind, "shape");
    assert.equal(f.name, "default");
    assert.ok(f.pointer && f.pointer.length > 0);
  });

  // (v.b) namespace import.
  test("rejects a namespace import as a shape finding", () => {
    const f = only(`import * as x from "bun:test";`, true);
    assert.equal(f.kind, "shape");
    assert.equal(f.name, "namespace");
  });

  // (v.c) side-effect import.
  test("rejects a side-effect import as a shape finding", () => {
    const f = only(`import "bun:test";`, true);
    assert.equal(f.kind, "shape");
    assert.equal(f.name, "side-effect");
  });

  // (vi.a) re-export shape in a *.test.js file.
  test("rejects a re-export in a test file", () => {
    const f = only(`export { test } from "bun:test";`, true);
    assert.equal(f.kind, "shape");
    assert.equal(f.name, "re-export-named");
  });

  // (vi.b) re-export shape in a non-test source file.
  test("rejects a re-export in a non-test source file", () => {
    const f = only(`export { test } from "bun:test";`, false);
    assert.equal(f.kind, "shape");
    assert.equal(f.name, "re-export-named");
  });

  // The two remaining re-export shapes are independently emitted.
  test("rejects export * and export { default as } re-exports", () => {
    const star = only(`export * from "bun:test";`, true);
    assert.equal(star.name, "re-export-namespace");
    assert.ok(star.pointer && star.pointer.length > 0);
    const defAs = only(`export { default as t } from "bun:test";`, true);
    assert.equal(defAs.name, "re-export-default-as");
    assert.ok(defAs.pointer && defAs.pointer.length > 0);
  });

  // The source-file ban rejects even an allowlisted symbol.
  test("rejects an allowlisted named import in a non-test source file", () => {
    const f = only(`import { describe } from "bun:test";`, false);
    assert.equal(f.kind, "symbol");
    assert.equal(f.name, "describe");
  });
});

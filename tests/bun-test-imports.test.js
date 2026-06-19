// Regression test for the bun:test universal-subset allowlist invariant.
// Lives in tests/ (the repo-root test set the `bun run test` glob scans)
// rather than co-located in .coaligned/, matching tests/service-url-drift.test.js,
// so the rule module's workspace dep (acorn) resolves from the repo root.
//
// Exercises every allowed/disallowed partition leaf against the pure verdict
// function `bunTestFindings`, then confirms the rule module's `check` surfaces
// those findings with the structured fields (kind, name, pointer) intact.

import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import ruleModule, {
  bunTestFindings,
} from "../.coaligned/invariants/bun-test-imports.rules.mjs";

const only = (src, isTestFile) => {
  const findings = bunTestFindings(src, isTestFile);
  assert.equal(findings.length, 1, `expected one finding for: ${src}`);
  return findings[0];
};

describe("bun-test-imports allowlist rules", () => {
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

// Mirrors libutil/src/rules.js applyRule — the production host supplies the
// real runRules; .coaligned cannot import @forwardimpact/* directly.
function applyRule(rule, subject) {
  const result = rule.check(subject, {});
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  return items.map((item) => ({
    id: rule.id,
    level: rule.severity,
    path: subject.path ?? null,
    lineNo: item.lineNo ?? subject.lineNo ?? null,
    message: rule.message(subject, item, {}),
    hint: rule.hint ?? null,
  }));
}

describe("bun-test-imports rule module", () => {
  const [rule] = ruleModule.rules;

  test("a test file with a banned import yields a structured finding", () => {
    const findings = applyRule(rule, {
      path: "services/demo/test/demo.test.js",
      text: `import { spyOn } from "bun:test";`,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, "bun-test.import-allowlist");
    assert.equal(findings[0].level, "fail");
    assert.equal(findings[0].lineNo, 1);
    assert.match(findings[0].message, /symbol/);
    assert.match(findings[0].message, /spyOn/);
    assert.ok(findings[0].hint);
  });

  test("a non-test source file importing bun:test yields a finding", () => {
    const findings = applyRule(rule, {
      path: "services/demo/src/demo.js",
      text: `import { describe } from "bun:test";`,
    });
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /describe/);
  });

  test("a clean test file yields no finding", () => {
    const findings = applyRule(rule, {
      path: "services/demo/test/demo.test.js",
      text: `import { describe, test, expect } from "bun:test";`,
    });
    assert.deepEqual(findings, []);
  });
});

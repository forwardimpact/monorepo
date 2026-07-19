import { describe, test } from "node:test";
import assert from "node:assert";

import { gradeChecks } from "../src/benchmark/grade.js";

const pass = (name, extra = {}) => ({ test: name, pass: true, ...extra });
const fail = (name, extra = {}) => ({ test: name, pass: false, ...extra });

describe("gradeChecks — scored rows", () => {
  test("score is the weighted fraction over mixed weights", () => {
    const grade = gradeChecks(
      [pass("a", { weight: 3 }), fail("b", { weight: 1 }), pass("c")],
      true,
    );
    assert.equal(grade.score, 4 / 5);
    assert.equal(grade.verdict, "fail");
    assert.equal(grade.gatesPass, true);
  });

  test("absent weight defaults to 1", () => {
    const grade = gradeChecks([pass("a"), fail("b")], true);
    assert.equal(grade.score, 1 / 2);
  });

  test("weight: 0 rows are diagnostics — never graded", () => {
    const grade = gradeChecks(
      [pass("a"), { test: "detail", weight: 0, note: "free-form" }],
      true,
    );
    assert.equal(grade.score, 1);
    assert.equal(grade.verdict, "pass");
    assert.equal(grade.malformed, 0);
  });

  test("gate rows are excluded from the score", () => {
    const grade = gradeChecks(
      [pass("g", { gate: true }), pass("a"), fail("b")],
      true,
    );
    assert.equal(grade.score, 1 / 2);
  });

  test("full marks over all-passing scored rows → verdict pass, score 1", () => {
    const grade = gradeChecks([pass("a"), pass("b", { weight: 2 })], true);
    assert.deepEqual(grade, {
      verdict: "pass",
      gatesPass: true,
      score: 1,
      fullMarks: true,
      malformed: 0,
    });
  });

  test("fractional weights still yield fullMarks when all pass", () => {
    const grade = gradeChecks(
      [
        pass("a", { weight: 0.1 }),
        pass("b", { weight: 0.1 }),
        pass("c", { weight: 0.1 }),
      ],
      true,
    );
    assert.equal(grade.fullMarks, true);
    assert.equal(grade.verdict, "pass");
  });

  test("fullMarks is false when any scored check fails", () => {
    const grade = gradeChecks([pass("a"), fail("b")], true);
    assert.equal(grade.fullMarks, false);
    assert.equal(grade.verdict, "fail");
  });
});

describe("gradeChecks — gates and health", () => {
  test("failing gate → gatesPass false with the score still derived", () => {
    const grade = gradeChecks(
      [fail("g", { gate: true }), pass("a"), pass("b")],
      true,
    );
    assert.equal(grade.gatesPass, false);
    assert.equal(grade.verdict, "fail");
    assert.equal(grade.score, 1);
  });

  test("unhealthy grader with all-passing rows → verdict fail", () => {
    const grade = gradeChecks([pass("a"), pass("g", { gate: true })], false);
    assert.equal(grade.verdict, "fail");
    assert.equal(grade.gatesPass, true);
    assert.equal(grade.fullMarks, true);
  });

  test("zero scored checks → score null (binary task)", () => {
    const grade = gradeChecks(
      [pass("g1", { gate: true }), pass("g2", { gate: true })],
      true,
    );
    assert.equal(grade.score, null);
    assert.equal(grade.verdict, "pass");
  });

  test("row-less healthy cell → verdict pass (no-op hook)", () => {
    const grade = gradeChecks([], true);
    assert.deepEqual(grade, {
      verdict: "pass",
      gatesPass: true,
      score: null,
      fullMarks: true,
      malformed: 0,
    });
  });
});

describe("gradeChecks — malformed rows", () => {
  const cases = [
    ["missing pass", { test: "x" }, 1],
    ["non-boolean pass", { test: "x", pass: "yes" }, 1],
    ["non-boolean gate", { test: "x", pass: true, gate: "true" }, 1],
    ["gate: false", { test: "x", pass: true, gate: false }, 1],
    [
      "gate alongside weight: 0",
      { test: "x", pass: true, gate: true, weight: 0 },
      1,
    ],
    [
      "gate alongside a positive weight",
      { test: "x", pass: true, gate: true, weight: 2 },
      2,
    ],
    [
      "gate alongside an invalid weight",
      { test: "x", pass: true, gate: true, weight: "2" },
      1,
    ],
    ["negative weight", { test: "x", pass: true, weight: -1 }, 1],
    ["Infinity weight", { test: "x", pass: true, weight: Infinity }, 1],
    ["NaN weight", { test: "x", pass: true, weight: NaN }, 1],
    ["string weight", { test: "x", pass: true, weight: "1" }, 1],
    ["parseError row", { raw: "not json", parseError: true }, 1],
    ["non-object row (null)", null, 1],
    ["non-object row (number)", 42, 1],
    ["non-object row (string)", "pass", 1],
    ["non-object row (array)", [{ pass: true }], 1],
  ];

  for (const [name, row, weight] of cases) {
    test(`${name} counts as a failing scored check at weight ${weight}`, () => {
      const grade = gradeChecks([pass("ok"), row], true);
      assert.equal(grade.malformed, 1);
      assert.equal(grade.score, 1 / (1 + weight));
      assert.equal(grade.fullMarks, false);
      assert.equal(grade.verdict, "fail");
    });
  }

  test("only malformed rows → score 0", () => {
    const grade = gradeChecks([{ bogus: true }], true);
    assert.equal(grade.score, 0);
    assert.equal(grade.malformed, 1);
    assert.equal(grade.verdict, "fail");
  });

  test("the source stamp is ignored by classification", () => {
    const grade = gradeChecks(
      [
        pass("a", { source: "tests" }),
        pass("g", { gate: true, source: "invariants" }),
      ],
      true,
    );
    assert.equal(grade.malformed, 0);
    assert.equal(grade.verdict, "pass");
  });
});

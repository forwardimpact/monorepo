/**
 * Unit tests for products/map/src/validation/skill.js — covers the
 * multiple-references validation rules and the deprecated
 * `implementationReference` rejection.
 */

import { test, describe } from "node:test";
import assert from "node:assert";

import { validateSkill } from "../src/validation/skill.js";

function baseSkill(extra = {}) {
  return {
    id: "planning",
    name: "Planning",
    capability: "delivery",
    human: {
      description: "Plan work.",
      proficiencyDescriptions: { working: "Plan and deliver." },
    },
    ...extra,
  };
}

function findError(errors, type, pathSuffix) {
  return errors.find(
    (e) =>
      e.type === type && (pathSuffix == null || e.path.endsWith(pathSuffix)),
  );
}

describe("validateSkill — references field", () => {
  test("absent references is valid", () => {
    const { errors } = validateSkill(baseSkill(), 0);
    assert.strictEqual(
      errors.find((e) => e.path.includes("references")),
      undefined,
    );
  });

  test("null references is valid", () => {
    const { errors } = validateSkill(baseSkill({ references: null }), 0);
    assert.strictEqual(
      errors.find((e) => e.path.includes("references")),
      undefined,
    );
  });

  test("empty array references is valid", () => {
    const { errors } = validateSkill(baseSkill({ references: [] }), 0);
    assert.strictEqual(
      errors.find((e) => e.path.includes("references")),
      undefined,
    );
  });

  test("non-array references is rejected", () => {
    const { errors } = validateSkill(
      baseSkill({ references: "not-an-array" }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references");
    assert.ok(err, "expected INVALID_VALUE on .references");
  });

  test("valid references entries pass", () => {
    const { errors } = validateSkill(
      baseSkill({
        references: [
          { name: "alpha", title: "Alpha", body: "Alpha body content." },
          { name: "beta", title: "Beta", body: "Beta body content." },
        ],
      }),
      0,
    );
    assert.strictEqual(
      errors.find((e) => e.path.includes("references")),
      undefined,
      `expected no reference errors, got: ${JSON.stringify(errors)}`,
    );
  });

  for (const bad of [
    "/slash",
    "..",
    ".",
    "Upper",
    "has space",
    "emoji🚀",
    "_leading-underscore",
    "-leading-dash",
    "a".repeat(65),
  ]) {
    test(`name "${bad}" → INVALID_VALUE on .references[0].name`, () => {
      const { errors } = validateSkill(
        baseSkill({
          references: [{ name: bad, title: "T", body: "Body." }],
        }),
        0,
      );
      const err = findError(errors, "INVALID_VALUE", ".references[0].name");
      assert.ok(err, `expected INVALID_VALUE for name "${bad}"`);
    });
  }

  test("empty name is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "", title: "T", body: "B." }] }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].name");
    assert.ok(err, "expected INVALID_VALUE on empty name");
  });

  test("name with null byte is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({
        references: [{ name: "ab\u0000c", title: "T", body: "B." }],
      }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].name");
    assert.ok(err, "expected INVALID_VALUE for null-byte name");
  });

  test("non-string name is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: 42, title: "T", body: "B." }] }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].name");
    assert.ok(err, "expected INVALID_VALUE on numeric name");
  });

  test("missing name is MISSING_REQUIRED", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ title: "T", body: "B." }] }),
      0,
    );
    const err = findError(errors, "MISSING_REQUIRED", ".references[0].name");
    assert.ok(err, "expected MISSING_REQUIRED on missing name");
  });

  test("exact-duplicate names rejected via seenNames Set", () => {
    // Both entries pass the regex, so the duplicate path in seenNames is
    // the rule that fires. Distinct from the case-only test below, which
    // is caught earlier by the lowercase-only regex.
    const { errors } = validateSkill(
      baseSkill({
        references: [
          { name: "alpha", title: "A", body: "Body A." },
          { name: "alpha", title: "B", body: "Body B." },
        ],
      }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[1].name");
    assert.ok(err, "expected INVALID_VALUE on duplicate name");
    assert.match(err.message, /[Dd]uplicate/, "message names duplicate");
  });

  test("case-only collision rejected (foo vs Foo) — by regex, not seenNames", () => {
    // Spec criterion 3 requires "duplicate `name` values within one skill,
    // including case-only collisions (foo vs Foo)" → INVALID_VALUE at
    // .references[i].name. Implementation enforces this by rejecting any
    // uppercase letter in the regex (Foo fails) — so the dedicated
    // case-insensitive comparison is defence-in-depth for any future regex
    // relaxation. Either way, the second entry must error.
    const { errors } = validateSkill(
      baseSkill({
        references: [
          { name: "foo", title: "A", body: "Body A." },
          { name: "Foo", title: "B", body: "Body B." },
        ],
      }),
      0,
    );
    const err = errors.find(
      (e) =>
        e.type === "INVALID_VALUE" && e.path.includes(".references[1].name"),
    );
    assert.ok(err, "expected validation error on second `Foo` entry");
  });

  test("missing title is MISSING_REQUIRED", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "x", body: "B." }] }),
      0,
    );
    const err = findError(errors, "MISSING_REQUIRED", ".references[0].title");
    assert.ok(err, "expected MISSING_REQUIRED on missing title");
  });

  test("non-string title is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "x", title: 7, body: "B." }] }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].title");
    assert.ok(err, "expected INVALID_VALUE on numeric title");
  });

  test("empty title is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "x", title: "", body: "B." }] }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].title");
    assert.ok(err, "expected INVALID_VALUE on empty title");
  });

  test("missing body is MISSING_REQUIRED", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "x", title: "T" }] }),
      0,
    );
    const err = findError(errors, "MISSING_REQUIRED", ".references[0].body");
    assert.ok(err, "expected MISSING_REQUIRED on missing body");
  });

  test("non-string body is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({ references: [{ name: "x", title: "T", body: [] }] }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].body");
    assert.ok(err, "expected INVALID_VALUE on array body");
  });

  test("whitespace-only body is INVALID_VALUE", () => {
    const { errors } = validateSkill(
      baseSkill({
        references: [{ name: "x", title: "T", body: "   \n\t  " }],
      }),
      0,
    );
    const err = findError(errors, "INVALID_VALUE", ".references[0].body");
    assert.ok(err, "expected INVALID_VALUE on whitespace-only body");
  });
});

describe("validateSkill — deprecated implementationReference", () => {
  test("any implementationReference value is rejected", () => {
    const { errors } = validateSkill(
      baseSkill({ implementationReference: "anything" }),
      0,
    );
    const err = findError(errors, "INVALID_FIELD", ".implementationReference");
    assert.ok(err, "expected INVALID_FIELD on implementationReference");
    assert.match(
      err.message,
      /skill\.references/,
      "deprecation message must name skill.references",
    );
  });

  test("non-string implementationReference is also rejected with same message", () => {
    const { errors } = validateSkill(
      baseSkill({ implementationReference: { x: 1 } }),
      0,
    );
    const err = findError(errors, "INVALID_FIELD", ".implementationReference");
    assert.ok(err, "non-string value still triggers friendly message");
    assert.match(err.message, /skill\.references/);
  });

  test("rejection accumulates with reference errors (no short-circuit)", () => {
    const { errors } = validateSkill(
      baseSkill({
        implementationReference: "x",
        references: [{ name: "BAD", title: "T", body: "B." }],
      }),
      0,
    );
    assert.ok(findError(errors, "INVALID_FIELD", ".implementationReference"));
    assert.ok(findError(errors, "INVALID_VALUE", ".references[0].name"));
  });
});

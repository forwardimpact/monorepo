import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkProfessionalTitleShape,
  checkProfessionalTitleDisjoint,
  checkAutonomyExpectation,
  CONTRACT_URL,
} from "../src/validation/level.js";

describe("checkProfessionalTitleShape", () => {
  for (const ok of [
    "Level I",
    "Level II",
    "Level 3",
    "Associate",
    "Mid",
    "Senior",
    "Staff",
    "Principal",
    "Distinguished",
    "Senior Staff",
    "Senior Principal",
  ]) {
    test(`accepts ${JSON.stringify(ok)}`, () =>
      assert.equal(checkProfessionalTitleShape(ok).ok, true));
  }
  for (const bad of [
    "Senior Engineer",
    "Senior Manager",
    "Engineer I",
    "engineer",
    "",
    null,
    undefined,
    "STAFF",
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () =>
      assert.equal(checkProfessionalTitleShape(bad).ok, false));
  }
});

describe("checkProfessionalTitleDisjoint", () => {
  const disciplines = [{ id: "swe", roleTitle: "Software Engineer" }];
  test("rejects shared token", () => {
    const r = checkProfessionalTitleDisjoint(
      { professionalTitle: "Engineer" },
      disciplines,
    );
    assert.equal(r.ok, false);
    assert.match(r.reason, /"engineer"/);
  });
  test("accepts disjoint single word", () => {
    assert.equal(
      checkProfessionalTitleDisjoint(
        { professionalTitle: "Senior" },
        disciplines,
      ).ok,
      true,
    );
  });
  test("ignores literal Level when tokenising", () => {
    const ds = [{ id: "swe", roleTitle: "Software Engineer Level" }];
    assert.equal(
      checkProfessionalTitleDisjoint({ professionalTitle: "Level I" }, ds).ok,
      true,
    );
  });
});

describe("checkAutonomyExpectation", () => {
  for (const ok of [
    "Work independently",
    "Lead the team",
    "Define a strategy",
    "Build resilient systems",
    "",
    null,
  ]) {
    test(`accepts ${JSON.stringify(ok)}`, () =>
      assert.equal(checkAutonomyExpectation(ok).ok, true));
  }
  for (const bad of [
    "Works independently",
    "Owns the roadmap",
    "Drives outcomes",
    "Leads the team",
    "Is responsible for",
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () =>
      assert.equal(checkAutonomyExpectation(bad).ok, false));
  }
});

test("CONTRACT_URL points at the canonical anchor", () => {
  assert.equal(
    CONTRACT_URL,
    "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions",
  );
});

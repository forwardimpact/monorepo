import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateAllData } from "../src/validation.js";
import { CONTRACT_URL } from "../src/validation/level.js";

function makeData(overrides = {}) {
  const baseLevel = {
    id: "J060",
    professionalTitle: "Level II",
    managementTitle: "Manager",
    ordinalRank: 2,
    baseSkillProficiencies: {
      core: "working",
      supporting: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: {
      autonomyExpectation: "Work independently on familiar problems",
    },
  };
  return {
    drivers: [{ id: "delivery", name: "Delivery" }],
    behaviours: [{ id: "ownership", name: "Ownership" }],
    skills: [{ id: "coding", name: "Coding", capability: "delivery" }],
    disciplines: [
      {
        id: "software_engineering",
        roleTitle: "Software Engineer",
        coreSkills: ["coding"],
        supportingSkills: [],
        broadSkills: [],
      },
    ],
    tracks: [],
    levels: [{ ...baseLevel, ...(overrides.level || {}) }],
    capabilities: [{ id: "delivery", name: "Delivery" }],
    ...overrides.top,
  };
}

describe("validateAllData K3/K5", () => {
  test("compliant input emits zero K3/K5 errors", () => {
    const result = validateAllData(makeData());
    const contractErrors = result.errors.filter(
      (e) =>
        e.path?.endsWith(".professionalTitle") ||
        e.path?.endsWith(".autonomyExpectation"),
    );
    assert.deepEqual(contractErrors, []);
  });

  test("non-disjoint professionalTitle emits one INVALID_VALUE", () => {
    const result = validateAllData(
      makeData({ level: { professionalTitle: "Engineer" } }),
    );
    const matches = result.errors.filter(
      (e) =>
        e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle",
    );
    assert.equal(matches.length, 1);
    assert.ok(matches[0].message.includes(CONTRACT_URL));
  });

  test("shape-violating professionalTitle is rejected", () => {
    const result = validateAllData(
      makeData({ level: { professionalTitle: "Senior Manager" } }),
    );
    const matches = result.errors.filter(
      (e) =>
        e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle",
    );
    assert.equal(matches.length, 1);
    assert.match(matches[0].message, /single capitalised rank word/);
  });

  test("multi-failure professionalTitle emits one error per failed predicate", () => {
    const result = validateAllData(
      makeData({ level: { professionalTitle: "Senior Engineer" } }),
    );
    const matches = result.errors.filter(
      (e) =>
        e.type === "INVALID_VALUE" && e.path === "levels[0].professionalTitle",
    );
    assert.equal(matches.length, 2);
  });

  test("third-person autonomyExpectation is rejected", () => {
    const result = validateAllData(
      makeData({
        level: { expectations: { autonomyExpectation: "Works independently" } },
      }),
    );
    const matches = result.errors.filter(
      (e) =>
        e.type === "INVALID_VALUE" &&
        e.path === "levels[0].expectations.autonomyExpectation",
    );
    assert.equal(matches.length, 1);
    assert.ok(matches[0].message.includes(CONTRACT_URL));
  });
});

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { prepareJobDetail } from "../job.js";
import { clearCache } from "../job-cache.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function makeDiscipline(overrides = {}) {
  return {
    id: "software_engineering",
    roleTitle: "Software Engineer",
    specialization: "Software Engineering",
    isManagement: false,
    isProfessional: true,
    coreSkills: ["coding", "testing"],
    supportingSkills: ["monitoring"],
    broadSkills: ["documentation"],
    behaviourModifiers: {},
    validTracks: [],
    ...overrides,
  };
}

function makeLevel(overrides = {}) {
  return {
    id: "level_3",
    professionalTitle: "Level III",
    managementTitle: "Manager",
    ordinalRank: 3,
    baseSkillProficiencies: {
      primary: "working",
      secondary: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: {},
    ...overrides,
  };
}

function makeSkills() {
  return [
    {
      id: "coding",
      name: "Coding",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: { working: "Writes production code" },
    },
    {
      id: "testing",
      name: "Testing",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: { working: "Designs test strategies" },
    },
    {
      id: "monitoring",
      name: "Monitoring",
      capability: "reliability",
      isHumanOnly: false,
      proficiencyDescriptions: { foundational: "Uses dashboards" },
    },
    {
      id: "documentation",
      name: "Documentation",
      capability: "documentation",
      isHumanOnly: false,
      proficiencyDescriptions: { awareness: "Reads docs" },
    },
  ];
}

function makeBehaviours() {
  return [
    {
      id: "collaboration",
      name: "Collaboration",
      maturityDescriptions: { developing: "Contributes to team" },
    },
  ];
}

function makeCapabilities() {
  return [
    {
      id: "delivery",
      name: "Delivery",
      emojiIcon: "🚀",
      ordinalRank: 1,
      professionalResponsibilities: {
        working: "Delivers features independently",
        practitioner: "Leads delivery across teams",
      },
    },
    {
      id: "reliability",
      name: "Reliability",
      emojiIcon: "🛡️",
      ordinalRank: 2,
      professionalResponsibilities: {
        foundational: "Follows reliability practices",
        working: "Implements reliability",
      },
    },
    {
      id: "documentation",
      name: "Documentation",
      emojiIcon: "📝",
      ordinalRank: 3,
      professionalResponsibilities: {
        awareness: "Reads docs",
        working: "Maintains documentation",
      },
    },
  ];
}

function makeDrivers() {
  return [];
}

// =============================================================================
// prepareJobDetail — capabilityOrder
// =============================================================================

describe("prepareJobDetail", () => {
  beforeEach(() => clearCache());

  test("capabilityOrder reflects derivedResponsibilities order", () => {
    const view = prepareJobDetail({
      discipline: makeDiscipline(),
      level: makeLevel(),
      track: null,
      skills: makeSkills(),
      behaviours: makeBehaviours(),
      drivers: makeDrivers(),
      capabilities: makeCapabilities(),
    });

    // derivedResponsibilities is sorted by proficiency desc, then skill count, then ordinalRank
    const expectedOrder = view.derivedResponsibilities.map(
      (r) => r.capability,
    );
    assert.deepStrictEqual(view.capabilityOrder, expectedOrder);
    assert.ok(view.capabilityOrder.length > 0);
  });

  test("capabilityOrder is empty when no capabilities provided", () => {
    const view = prepareJobDetail({
      discipline: makeDiscipline(),
      level: makeLevel(),
      track: null,
      skills: makeSkills(),
      behaviours: makeBehaviours(),
      drivers: makeDrivers(),
    });

    assert.deepStrictEqual(view.capabilityOrder, []);
    assert.deepStrictEqual(view.derivedResponsibilities, []);
  });
});

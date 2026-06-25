import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PathwayGenerator } from "../src/engine/pathway.js";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Mock ProseGenerator that returns fixture data for each entity type.
 */
function makeMockProseGenerator() {
  return {
    generateJson: async (key) => {
      if (key.includes("standard")) {
        return { title: "Test", emojiIcon: "🏗️", tag: "#test" };
      }
      if (key.includes("levels")) {
        return [
          {
            id: "J040",
            professionalTitle: "Engineer",
            baseSkillProficiencies: { core: "awareness" },
          },
        ];
      }
      if (key.includes("behaviour")) {
        return { name: "Collaboration" };
      }
      if (key.includes("capability")) {
        return {
          name: "Coding",
          skills: [{ id: "python", name: "Python" }],
        };
      }
      if (key.includes("drivers")) {
        return [{ id: "clear-direction", name: "Clear Direction" }];
      }
      if (key.includes("discipline")) {
        return { roleTitle: "Software Engineer" };
      }
      if (key.includes("track")) {
        return { name: "Backend" };
      }
      return null;
    },
  };
}

describe("PathwayGenerator", () => {
  test("requires proseGenerator and logger", () => {
    assert.throws(() => new PathwayGenerator(null, makeLogger()));
    assert.throws(() => new PathwayGenerator(makeMockProseGenerator(), null));
  });

  test("generates all entity types", async () => {
    const generator = new PathwayGenerator(
      makeMockProseGenerator(),
      makeLogger(),
    );

    const standard = {
      name: "Test",
      levels: [{ id: "J040", professionalTitle: "Engineer", rank: 1 }],
      behaviours: [{ id: "collab", name: "Collaboration" }],
      capabilities: [{ id: "coding", name: "Coding", skills: ["python"] }],
      drivers: [
        { id: "clear-direction", name: "Clear Direction", skills: ["python"] },
      ],
      disciplines: [
        {
          id: "se",
          roleTitle: "Software Engineer",
          core: ["python"],
          supporting: [],
          broad: [],
        },
      ],
      tracks: [{ id: "backend", name: "Backend" }],
      seed: 42,
    };

    const schemas = {
      standard: {},
      levels: {},
      behaviour: {},
      capability: {},
      drivers: {},
      discipline: {},
      track: {},
      "self-assessments": {},
      defs: {},
    };

    const result = await generator.generate({
      standard,
      domain: "test.example",
      industry: "pharma",
      schemas,
    });

    assert.ok(result.standard);
    assert.ok(result.levels);
    assert.ok(Array.isArray(result.behaviours));
    assert.ok(Array.isArray(result.capabilities));
    assert.ok(result.drivers);
    assert.ok(Array.isArray(result.disciplines));
    assert.ok(Array.isArray(result.tracks));
    assert.ok(Array.isArray(result.selfAssessments));
  });

  test("self-assessments use vocabulary constants", async () => {
    const generator = new PathwayGenerator(
      makeMockProseGenerator(),
      makeLogger(),
    );

    const standard = {
      name: "Test",
      levels: [{ id: "J040", rank: 1 }],
      behaviours: [{ id: "collab", name: "Collaboration" }],
      capabilities: [{ id: "coding", name: "Coding", skills: ["python"] }],
      drivers: [],
      disciplines: [],
      tracks: [],
      seed: 42,
    };
    const schemas = {
      standard: {},
      levels: {},
      behaviour: {},
      capability: {},
      drivers: {},
      discipline: {},
      track: {},
    };

    const result = await generator.generate({
      standard,
      domain: "test.example",
      industry: "pharma",
      schemas,
    });

    const validProficiencies = new Set([
      "awareness",
      "foundational",
      "working",
      "practitioner",
      "expert",
    ]);
    const validMaturities = new Set([
      "emerging",
      "developing",
      "practicing",
      "role-modeling",
      "exemplifying",
    ]);

    for (const sa of result.selfAssessments) {
      for (const val of Object.values(sa.skillProficiencies)) {
        assert.ok(validProficiencies.has(val), `Invalid proficiency: ${val}`);
      }
      for (const val of Object.values(sa.behaviourMaturities)) {
        assert.ok(validMaturities.has(val), `Invalid maturity: ${val}`);
      }
    }
  });
});

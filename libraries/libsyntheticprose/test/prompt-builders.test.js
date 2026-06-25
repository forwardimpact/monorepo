import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildStandardPrompt } from "../src/prompts/pathway/standard.js";
import { buildLevelPrompt } from "../src/prompts/pathway/level.js";
import { buildBehaviourPrompt } from "../src/prompts/pathway/behaviour.js";
import { buildCapabilityPrompt } from "../src/prompts/pathway/capability.js";
import { buildDriverPrompt } from "../src/prompts/pathway/driver.js";
import { buildDisciplinePrompt } from "../src/prompts/pathway/discipline.js";
import { buildTrackPrompt } from "../src/prompts/pathway/track.js";

const CTX = {
  domain: "test.example",
  industry: "pharma",
  standardName: "Test Standard",
};

const SCHEMA = { type: "object", properties: {} };

describe("prompt builders", () => {
  describe("buildStandardPrompt", () => {
    test("returns system and user strings", () => {
      const result = buildStandardPrompt({}, CTX, SCHEMA);
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes preamble in system prompt", () => {
      const result = buildStandardPrompt({}, CTX, SCHEMA);
      assert.ok(result.system.includes("Test Standard"));
    });

    test("includes JSON schema in user prompt", () => {
      const result = buildStandardPrompt({}, CTX, SCHEMA);
      assert.ok(result.user.includes('"type"'));
    });
  });

  describe("buildLevelPrompt", () => {
    const levels = [
      { id: "J040", professionalTitle: "Engineer", rank: 1, experience: "0-2" },
      {
        id: "J050",
        professionalTitle: "Senior",
        rank: 2,
        experience: "2-5",
      },
    ];

    test("returns system and user strings", () => {
      const result = buildLevelPrompt(levels, CTX, SCHEMA);
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes level IDs in user prompt", () => {
      const result = buildLevelPrompt(levels, CTX, SCHEMA);
      assert.ok(result.user.includes("J040"));
      assert.ok(result.user.includes("J050"));
    });

    test("uses vocabulary imports for proficiency names", () => {
      const result = buildLevelPrompt(levels, CTX, SCHEMA);
      assert.ok(result.user.includes("awareness"));
      assert.ok(result.user.includes("expert"));
    });
  });

  describe("buildBehaviourPrompt", () => {
    const skeleton = { id: "collaboration", name: "Collaboration" };

    test("returns system and user strings", () => {
      const result = buildBehaviourPrompt(skeleton, CTX, SCHEMA);
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes behaviour ID", () => {
      const result = buildBehaviourPrompt(skeleton, CTX, SCHEMA);
      assert.ok(result.user.includes("collaboration"));
    });

    test("includes prior output when provided", () => {
      const priorOutput = {
        levels: [
          {
            id: "L1",
            professionalTitle: "Engineer",
            baseSkillProficiencies: { core: "awareness" },
          },
        ],
      };
      const result = buildBehaviourPrompt(skeleton, CTX, SCHEMA, priorOutput);
      assert.ok(result.user.includes("Previously generated context"));
      assert.ok(result.user.includes("Engineer"));
    });
  });

  describe("buildCapabilityPrompt", () => {
    const skeleton = {
      id: "coding",
      name: "Coding",
      skills: ["python", "java"],
      ordinalRank: 1,
    };

    test("returns system and user strings", () => {
      const result = buildCapabilityPrompt(skeleton, CTX, SCHEMA);
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes skill IDs", () => {
      const result = buildCapabilityPrompt(skeleton, CTX, SCHEMA);
      assert.ok(result.user.includes("python"));
      assert.ok(result.user.includes("java"));
    });

    test("includes prior output when provided", () => {
      const priorOutput = {
        levels: [{ id: "L1", professionalTitle: "Junior" }],
        behaviours: [{ _id: "collab", name: "Collaboration" }],
      };
      const result = buildCapabilityPrompt(skeleton, CTX, SCHEMA, priorOutput);
      assert.ok(result.user.includes("Previously generated context"));
      assert.ok(result.user.includes("Junior"));
      assert.ok(result.user.includes("Collaboration"));
    });
  });

  describe("buildDriverPrompt", () => {
    const drivers = [
      { id: "clear-direction", name: "Clear Direction", skills: ["python"] },
    ];

    test("returns system and user strings", () => {
      const result = buildDriverPrompt(
        drivers,
        { ...CTX, skillIds: ["python"], behaviourIds: ["collab"] },
        SCHEMA,
      );
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes driver IDs", () => {
      const result = buildDriverPrompt(
        drivers,
        { ...CTX, skillIds: ["python"], behaviourIds: [] },
        SCHEMA,
      );
      assert.ok(result.user.includes("clear-direction"));
    });
  });

  describe("buildDisciplinePrompt", () => {
    const skeleton = {
      id: "se",
      roleTitle: "Software Engineer",
      specialization: "Backend",
      isProfessional: true,
      core: ["python"],
      supporting: [],
      broad: [],
      validTracks: [null],
    };

    test("returns system and user strings", () => {
      const result = buildDisciplinePrompt(
        skeleton,
        { ...CTX, skillIds: ["python"], behaviourIds: [], trackIds: [] },
        SCHEMA,
      );
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("does not reference {roleName} placeholder", () => {
      const result = buildDisciplinePrompt(
        skeleton,
        { ...CTX, skillIds: ["python"], behaviourIds: [], trackIds: [] },
        SCHEMA,
      );
      assert.ok(!result.user.includes("{roleName}"));
    });

    test("includes prior output when provided", () => {
      const priorOutput = {
        levels: [{ id: "L1", professionalTitle: "Junior" }],
        behaviours: [{ _id: "collab", name: "Collaboration" }],
        capabilities: [
          { _id: "coding", name: "Coding", skills: [{ id: "python" }] },
        ],
      };
      const result = buildDisciplinePrompt(
        skeleton,
        { ...CTX, skillIds: ["python"], behaviourIds: [], trackIds: [] },
        SCHEMA,
        priorOutput,
      );
      assert.ok(result.user.includes("Previously generated context"));
    });
  });

  describe("buildTrackPrompt", () => {
    const skeleton = { id: "backend", name: "Backend" };

    test("returns system and user strings", () => {
      const result = buildTrackPrompt(
        skeleton,
        { ...CTX, capabilityIds: ["coding"], behaviourIds: ["collab"] },
        SCHEMA,
      );
      assert.ok(typeof result.system === "string");
      assert.ok(typeof result.user === "string");
    });

    test("includes track ID", () => {
      const result = buildTrackPrompt(
        skeleton,
        { ...CTX, capabilityIds: [], behaviourIds: [] },
        SCHEMA,
      );
      assert.ok(result.user.includes("backend"));
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deriveResponsibilities,
  deriveJob,
} from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
  testCategories,
} from "./model-fixtures.js";

describe("deriveResponsibilities", () => {
  it("returns empty array when no capabilities provided", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: [],
    });
    assert.strictEqual(result.length, 0);
  });

  it("excludes awareness-only capabilities", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "awareness" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 0);
  });

  it("includes capabilities based on skill proficiency", () => {
    // skill_a is in testDiscipline.coreSkills and has capability "scale"
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].capability, "scale");
    assert.strictEqual(result[0].proficiency, "working");
  });

  it("uses highest skill proficiency in each capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
      {
        skillId: "skill_extra",
        capability: "scale",
        proficiency: "practitioner",
      },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    // Should use practitioner level for scale capability
    const scaleResp = result.find((r) => r.capability === "scale");
    assert.ok(scaleResp);
    assert.strictEqual(scaleResp.proficiency, "practitioner");
    assert.strictEqual(
      scaleResp.responsibility,
      "Lead architectural decisions",
    );
  });

  it("includes responsibility from capability definition", () => {
    const skillMatrix = [
      { skillId: "skill_b", capability: "ai", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    const aiResp = result.find((r) => r.capability === "ai");
    assert.ok(aiResp);
    assert.strictEqual(aiResp.responsibility, "Integrate AI capabilities");
    assert.strictEqual(aiResp.proficiency, "working");
  });

  it("includes emoji from capability", () => {
    const skillMatrix = [
      { skillId: "skill_a", capability: "scale", proficiency: "working" },
    ];
    const result = deriveResponsibilities({
      skillMatrix,
      capabilities: testCategories,
    });
    assert.strictEqual(result[0].emojiIcon, "📐");
  });
});

describe("deriveJob with capabilities", () => {
  it("includes derived responsibilities when capabilities provided", () => {
    const job = deriveJob({
      discipline: testDiscipline,
      level: testLevel,
      track: testTrack,
      skills: testSkills,
      behaviours: testBehaviours,
      capabilities: testCategories,
    });

    assert.ok(job);
    assert.ok(job.derivedResponsibilities);
    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.ok(job.derivedResponsibilities.length > 0);
  });

  it("returns empty responsibilities when no capabilities provided", () => {
    const job = deriveJob({
      discipline: testDiscipline,
      level: testLevel,
      track: testTrack,
      skills: testSkills,
      behaviours: testBehaviours,
    });

    assert.ok(job);
    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.strictEqual(job.derivedResponsibilities.length, 0);
  });
});

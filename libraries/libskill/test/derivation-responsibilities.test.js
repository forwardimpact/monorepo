import { test, describe } from "node:test";
import assert from "node:assert";

import { deriveResponsibilities, deriveJob } from "../derivation.js";
import {
  makeDiscipline,
  makeManagementDiscipline,
  makeLevel,
  makeTrack,
  makeSkills,
  makeBehaviours,
  makeCapabilities,
} from "./derivation-fixtures.js";

describe("deriveResponsibilities", () => {
  test("returns empty array for empty capabilities", () => {
    const result = deriveResponsibilities({
      skillMatrix: [],
      capabilities: [],
      discipline: makeDiscipline(),
    });
    assert.deepStrictEqual(result, []);
  });

  test("returns empty array for null capabilities", () => {
    const result = deriveResponsibilities({
      skillMatrix: [],
      capabilities: null,
      discipline: makeDiscipline(),
    });
    assert.deepStrictEqual(result, []);
  });

  test("skips awareness-only capabilities", () => {
    const skillMatrix = [
      {
        skillId: "documentation",
        skillName: "Documentation",
        capability: "documentation",
        type: "broad",
        proficiency: "awareness",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const docResp = result.find((r) => r.capability === "documentation");
    assert.strictEqual(docResp, undefined);
  });

  test("uses professionalResponsibilities for IC discipline", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(
      delivery.responsibility,
      "Delivers features independently",
    );
  });

  test("uses managementResponsibilities for management discipline", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeManagementDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(delivery.responsibility, "Manages delivery");
  });

  test("uses max proficiency per capability", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "practitioner",
      },
      {
        skillId: "testing",
        skillName: "Testing",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    const delivery = result.find((r) => r.capability === "delivery");
    assert.strictEqual(delivery.proficiency, "practitioner");
    assert.strictEqual(delivery.responsibility, "Leads delivery across teams");
  });

  test("sorts by proficiency descending", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
      {
        skillId: "capacity_planning",
        skillName: "Capacity Planning",
        capability: "scale",
        type: "secondary",
        proficiency: "practitioner",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    // practitioner(3) should come before working(2)
    assert.strictEqual(result[0].capability, "scale");
    assert.strictEqual(result[1].capability, "delivery");
  });

  test("includes emojiIcon and ordinalRank in output", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    assert.strictEqual(result[0].emojiIcon, "🚀");
    assert.strictEqual(result[0].ordinalRank, 1);
  });

  test("does not include internal proficiencyIndex and skillCount fields", () => {
    const skillMatrix = [
      {
        skillId: "coding",
        skillName: "Coding",
        capability: "delivery",
        type: "primary",
        proficiency: "working",
      },
    ];
    const capabilities = makeCapabilities();
    const discipline = makeDiscipline();

    const result = deriveResponsibilities({
      skillMatrix,
      capabilities,
      discipline,
    });

    assert.strictEqual(result[0].proficiencyIndex, undefined);
    assert.strictEqual(result[0].skillCount, undefined);
  });
});

// =============================================================================
// deriveJob
// =============================================================================

describe("deriveJob", () => {
  test("returns null for invalid combination", () => {
    const discipline = makeDiscipline({ validTracks: ["data"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, track, skills, behaviours });
    assert.strictEqual(job, null);
  });

  test("returns complete job definition for valid combination", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.strictEqual(job.id, "software_engineering_level_3");
    assert.strictEqual(job.title, "Software Engineer Level III");
    assert.strictEqual(job.discipline, discipline);
    assert.strictEqual(job.level, level);
    assert.strictEqual(job.track, null);
    assert.ok(Array.isArray(job.skillMatrix));
    assert.ok(Array.isArray(job.behaviourProfile));
    assert.ok(job.skillMatrix.length > 0);
    assert.ok(job.behaviourProfile.length > 0);
  });

  test("generates correct ID with track", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, track, skills, behaviours });

    assert.strictEqual(job.id, "software_engineering_level_3_platform");
  });

  test("includes expectations from level", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.strictEqual(job.expectations.impactScope, "team");
    assert.strictEqual(job.expectations.autonomyExpectation, "independently");
  });

  test("includes derived responsibilities when capabilities provided", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();
    const capabilities = makeCapabilities();

    const job = deriveJob({
      discipline,
      level,
      skills,
      behaviours,
      capabilities,
    });

    assert.ok(Array.isArray(job.derivedResponsibilities));
    assert.ok(job.derivedResponsibilities.length > 0);
  });

  test("returns empty responsibilities when no capabilities", () => {
    const discipline = makeDiscipline();
    const level = makeLevel();
    const skills = makeSkills();
    const behaviours = makeBehaviours();

    const job = deriveJob({ discipline, level, skills, behaviours });

    assert.deepStrictEqual(job.derivedResponsibilities, []);
  });

  test("validates via validationRules", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const skills = makeSkills();
    const behaviours = makeBehaviours();
    const validationRules = {
      invalidCombinations: [
        {
          discipline: "software_engineering",
          track: "platform",
          level: "level_3",
        },
      ],
    };

    const job = deriveJob({
      discipline,
      level,
      track,
      skills,
      behaviours,
      validationRules,
    });
    assert.strictEqual(job, null);
  });
});

// =============================================================================
// calculateDriverCoverage
// =============================================================================

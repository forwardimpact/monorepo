import { describe, it } from "node:test";
import assert from "node:assert";

import {
  validateSelfAssessment,
  validateQuestionBank,
} from "@forwardimpact/map/validation";

import { testSkills, testBehaviours } from "./model-fixtures.js";

describe("Validation", () => {
  describe("validateSelfAssessment", () => {
    it("validates valid self-assessment", () => {
      const result = validateSelfAssessment(
        {
          skillProficiencies: { skill_a: "working", skill_b: "foundational" },
          behaviourMaturities: { behaviour_x: "practicing" },
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid skill references", () => {
      const result = validateSelfAssessment(
        {
          skillProficiencies: { nonexistent: "working" },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid skill proficiencies", () => {
      const result = validateSelfAssessment(
        {
          skillProficiencies: { skill_a: "master" }, // Invalid level
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });
  });

  describe("validateQuestionBank", () => {
    it("validates valid question bank", () => {
      const result = validateQuestionBank(
        {
          skillProficiencies: {
            skill_a: {
              professionalQuestions: {
                practitioner: [
                  { id: "q1", text: "Question 1", type: "technical" },
                ],
              },
            },
          },
          behaviourMaturities: {
            behaviour_x: {
              professionalQuestions: {
                practicing: [
                  { id: "q2", text: "Question 2", type: "behavioural" },
                ],
              },
            },
          },
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, true);
    });

    it("detects invalid skill references in question bank", () => {
      const result = validateQuestionBank(
        {
          skillProficiencies: {
            nonexistent_skill: {
              professionalQuestions: {
                practitioner: [
                  { id: "q1", text: "Question 1", type: "technical" },
                ],
              },
            },
          },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_REFERENCE"));
    });

    it("detects invalid skill proficiencies in question bank", () => {
      const result = validateQuestionBank(
        {
          skillProficiencies: {
            skill_a: {
              professionalQuestions: {
                master: [{ id: "q1", text: "Question 1", type: "technical" }],
              },
            },
          },
          behaviourMaturities: {},
        },
        testSkills,
        testBehaviours,
      );

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.type === "INVALID_VALUE"));
    });
  });
});

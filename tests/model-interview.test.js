import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deriveInterviewQuestions,
  deriveShortInterview,
  deriveBehaviourQuestions,
  deriveFocusedInterview,
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "@forwardimpact/libskill/interview";

import { deriveJob } from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testBehaviours,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

describe("Interview", () => {
  const job = deriveJob({
    discipline: testDiscipline,
    level: testLevel,
    track: testTrack,
    skills: testSkills,
    behaviours: testBehaviours,
  });

  const questionBank = {
    skillProficiencies: {
      skill_a: {
        professionalQuestions: {
          practitioner: [
            {
              id: "q1",
              text: "Question about skill A",
              type: "technical",
              expectedDurationMinutes: 5,
            },
          ],
          expert: [
            {
              id: "q2",
              text: "Expert question",
              type: "technical",
              expectedDurationMinutes: 10,
            },
          ],
        },
        managementQuestions: {
          practitioner: [
            {
              id: "q1_mgmt",
              text: "Management question about skill A",
              type: "technical",
              expectedDurationMinutes: 5,
            },
          ],
        },
      },
    },
    behaviourMaturities: {
      behaviour_x: {
        professionalQuestions: {
          role_modeling: [
            {
              id: "q3",
              text: "Behaviour question",
              type: "behavioural",
              expectedDurationMinutes: 8,
            },
          ],
        },
        managementQuestions: {
          role_modeling: [
            {
              id: "q3_mgmt",
              text: "Management behaviour question",
              type: "behavioural",
              expectedDurationMinutes: 8,
            },
          ],
        },
      },
    },
  };

  describe("deriveInterviewQuestions", () => {
    it("generates interview questions", () => {
      const interview = deriveInterviewQuestions({
        job,
        questionBank,
        options: { includeBelowLevel: false },
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.expectedDurationMinutes > 0);
      assert.ok(
        interview.coverage.skills.length > 0 ||
          interview.coverage.behaviours.length > 0,
      );
    });

    it("includes below-level questions when requested", () => {
      const interview = deriveInterviewQuestions({
        job,
        questionBank,
        options: { includeBelowLevel: true },
      });

      // Should include questions from practitioner level for skill_a (which requires expert)
      const belowLevelQ = interview.questions.find(
        (q) => q.targetId === "skill_a" && q.targetLevel === "practitioner",
      );
      assert.ok(belowLevelQ);
    });
  });

  describe("deriveShortInterview", () => {
    it("respects time budget", () => {
      const interview = deriveShortInterview({
        job,
        questionBank,
        targetMinutes: 15,
      });

      // Should be within reasonable range of target
      assert.ok(interview.expectedDurationMinutes <= 20);
    });
  });

  describe("deriveBehaviourQuestions", () => {
    it("only includes behaviour questions", () => {
      const interview = deriveBehaviourQuestions({
        job,
        questionBank,
      });

      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.strictEqual(interview.coverage.skills.length, 0);
    });
  });

  describe("deriveFocusedInterview", () => {
    it("generates questions only for focused skills", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: ["skill_a"],
        focusBehaviours: [],
      });

      // Should only have skill questions for skill_a
      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "skill"));
      assert.ok(interview.questions.every((q) => q.targetId === "skill_a"));
    });

    it("generates questions only for focused behaviours", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: [],
        focusBehaviours: ["behaviour_x"],
      });

      // Should only have behaviour questions for behaviour_x
      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.ok(interview.questions.every((q) => q.targetId === "behaviour_x"));
    });

    it("generates questions for both focused skills and behaviours", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: ["skill_a"],
        focusBehaviours: ["behaviour_x"],
      });

      const skillQuestions = interview.questions.filter(
        (q) => q.targetType === "skill",
      );
      const behaviourQuestions = interview.questions.filter(
        (q) => q.targetType === "behaviour",
      );

      assert.ok(skillQuestions.length > 0);
      assert.ok(behaviourQuestions.length > 0);
    });

    it("returns empty questions when no focus specified", () => {
      const interview = deriveFocusedInterview({
        job,
        questionBank,
        focusSkills: [],
        focusBehaviours: [],
      });

      assert.strictEqual(interview.questions.length, 0);
    });
  });

  describe("deriveMissionFitInterview", () => {
    it("only includes skill questions", () => {
      const interview = deriveMissionFitInterview({
        job,
        questionBank,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "skill"));
      assert.strictEqual(interview.coverage.behaviours.length, 0);
    });
  });

  describe("deriveDecompositionInterview", () => {
    it("only includes capability questions", () => {
      const bankWithCapabilities = {
        ...questionBank,
        capabilityLevels: {
          scale: {
            professionalQuestions: {
              practitioner: [
                {
                  id: "cap_q1",
                  text: "Decomposition question",
                  type: "decomposition",
                  expectedDurationMinutes: 15,
                },
              ],
            },
          },
        },
      };

      const interview = deriveDecompositionInterview({
        job,
        questionBank: bankWithCapabilities,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(
        interview.questions.every((q) => q.targetType === "capability"),
      );
      assert.strictEqual(interview.coverage.skills.length, 0);
      assert.strictEqual(interview.coverage.behaviours.length, 0);
    });
  });

  describe("deriveStakeholderInterview", () => {
    it("only includes behaviour questions", () => {
      const interview = deriveStakeholderInterview({
        job,
        questionBank,
      });

      assert.ok(interview.questions.length > 0);
      assert.ok(interview.questions.every((q) => q.targetType === "behaviour"));
      assert.strictEqual(interview.coverage.skills.length, 0);
    });

    it("respects time budget", () => {
      const interview = deriveStakeholderInterview({
        job,
        questionBank,
        targetMinutes: 60,
      });

      assert.ok(interview.expectedDurationMinutes <= 65);
    });
  });
});

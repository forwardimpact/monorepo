import { describe, it } from "node:test";
import assert from "node:assert";

import {
  isCapability,
  getSkillsByCapability,
  buildCapabilityToSkillsMap,
  expandModifiersToSkills,
  extractCapabilityModifiers,
  extractSkillModifiers,
  resolveSkillModifier,
} from "@forwardimpact/libskill/modifiers";

import {
  deriveChecklist,
  formatChecklistMarkdown,
} from "@forwardimpact/libskill/checklist";

import { deriveSkillProficiency } from "@forwardimpact/libskill/derivation";

import {
  testSkills,
  testDiscipline,
  testTrack,
  testLevel,
} from "./model-fixtures.js";

describe("Skill Modifiers", () => {
  describe("isCapability", () => {
    it("returns true for valid skill capabilities", () => {
      assert.strictEqual(isCapability("delivery"), true);
      assert.strictEqual(isCapability("scale"), true);
      assert.strictEqual(isCapability("reliability"), true);
      assert.strictEqual(isCapability("data"), true);
      assert.strictEqual(isCapability("ai"), true);
      assert.strictEqual(isCapability("process"), true);
      assert.strictEqual(isCapability("business"), true);
      assert.strictEqual(isCapability("people"), true);
      assert.strictEqual(isCapability("documentation"), true);
    });

    it("returns false for skill IDs", () => {
      assert.strictEqual(isCapability("architecture_design"), false);
      assert.strictEqual(isCapability("skill_a"), false);
      assert.strictEqual(isCapability("devops"), false);
    });
  });

  describe("getSkillsByCapability", () => {
    it("returns skills matching the capability", () => {
      const scaleSkills = getSkillsByCapability(testSkills, "scale");
      assert.strictEqual(scaleSkills.length, 1);
      assert.strictEqual(scaleSkills[0].id, "skill_a");
    });

    it("returns empty array for non-existent capability", () => {
      const skills = getSkillsByCapability(testSkills, "nonexistent");
      assert.strictEqual(skills.length, 0);
    });
  });

  describe("buildCapabilityToSkillsMap", () => {
    it("builds a map of capabilities to skill IDs", () => {
      const map = buildCapabilityToSkillsMap(testSkills);
      assert.deepStrictEqual(map.scale, ["skill_a"]);
      assert.deepStrictEqual(map.ai, ["skill_b"]);
      assert.deepStrictEqual(map.people, ["skill_c"]);
      assert.deepStrictEqual(map.data, []);
    });
  });

  describe("expandModifiersToSkills", () => {
    it("expands capability modifiers to individual skills", () => {
      const modifiers = { scale: 1 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      assert.strictEqual(expanded.skill_a, 1);
    });

    it("ignores non-capability keys (validation should catch these)", () => {
      const modifiers = { scale: 1, skill_a: 2 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      // Individual skill modifiers are ignored - only capability modifiers are expanded
      // skill_a gets value from scale capability (1), not from individual modifier
      assert.strictEqual(expanded.skill_a, 1);
    });

    it("expands multiple capabilities", () => {
      const modifiers = { ai: -1, scale: 1 };
      const expanded = expandModifiersToSkills(modifiers, testSkills);
      assert.strictEqual(expanded.skill_a, 1); // scale capability
      assert.strictEqual(expanded.skill_b, -1); // ai capability
    });

    it("returns empty object for null input", () => {
      const expanded = expandModifiersToSkills(null, testSkills);
      assert.deepStrictEqual(expanded, {});
    });
  });

  describe("extractCapabilityModifiers", () => {
    it("extracts only capability-based modifiers", () => {
      const modifiers = { scale: 1, skill_a: 2, data: -1 };
      const capabilities = extractCapabilityModifiers(modifiers);
      assert.deepStrictEqual(capabilities, { scale: 1, data: -1 });
    });

    it("returns empty object for null input", () => {
      const capabilities = extractCapabilityModifiers(null);
      assert.deepStrictEqual(capabilities, {});
    });
  });

  describe("extractSkillModifiers", () => {
    it("extracts only individual skill modifiers", () => {
      const modifiers = { scale: 1, skill_a: 2, data: -1 };
      const individual = extractSkillModifiers(modifiers);
      assert.deepStrictEqual(individual, { skill_a: 2 });
    });

    it("returns empty object for null input", () => {
      const individual = extractSkillModifiers(null);
      assert.deepStrictEqual(individual, {});
    });
  });

  describe("resolveSkillModifier", () => {
    it("returns capability modifier for skill in that capability", () => {
      const modifiers = { scale: 1 };
      const modifier = resolveSkillModifier("skill_a", modifiers, testSkills);
      assert.strictEqual(modifier, 1);
    });

    it("returns 0 when no modifier applies", () => {
      const modifiers = { data: 1 };
      const modifier = resolveSkillModifier("skill_a", modifiers, testSkills);
      assert.strictEqual(modifier, 0);
    });

    it("returns 0 for null modifiers", () => {
      const modifier = resolveSkillModifier("skill_a", null, testSkills);
      assert.strictEqual(modifier, 0);
    });
  });

  describe("deriveSkillProficiency with capability modifiers", () => {
    it("applies capability modifier when skills array is provided (capped at level max)", () => {
      const trackWithCapabilityModifier = {
        ...testTrack,
        skillModifiers: { scale: 1 },
      };
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: trackWithCapabilityModifier,
        skillId: "skill_a",
        skills: testSkills,
      });
      // skill_a is primary, base is practitioner (index 3), +1 would be expert
      // but capped at level max (practitioner)
      assert.strictEqual(level, "practitioner");
    });

    it("capability modifier applies to all skills in capability", () => {
      const trackWithCapability = {
        ...testTrack,
        skillModifiers: { scale: -1 },
      };
      const level = deriveSkillProficiency({
        discipline: testDiscipline,
        level: testLevel,
        track: trackWithCapability,
        skillId: "skill_a",
        skills: testSkills,
      });
      // skill_a is primary, base is practitioner (index 3), -1 = working
      assert.strictEqual(level, "working");
    });
  });
});

describe("Checklist Derivation", () => {
  // Test skills with agent.stages defined
  const testSkillsWithStages = [
    {
      id: "arch",
      name: "Architecture",
      capability: "scale",
      agent: {
        name: "architecture",
        description: "Architecture skill",
        stages: {
          plan: {
            focus: "Design architecture",
            readChecklist: ["Gather requirements", "Design components"],
            confirmChecklist: [
              "Architecture documented",
              "Trade-offs explicit",
            ],
          },
          code: {
            focus: "Implement architecture",
            readChecklist: ["Build components"],
            confirmChecklist: ["Implementation matches design"],
          },
        },
      },
    },
    {
      id: "devops",
      name: "DevOps",
      capability: "reliability",
      agent: {
        name: "devops",
        description: "DevOps skill",
        stages: {
          code: {
            focus: "Build pipelines",
            readChecklist: ["Set up CI/CD"],
            confirmChecklist: ["Pipeline working", "Tests green"],
          },
        },
      },
    },
    {
      id: "collab",
      name: "Collaboration",
      capability: "people",
      // No agent section - human-only skill
    },
  ];

  const testCapabilities = [
    { id: "scale", name: "Scale", emojiIcon: "📐" },
    { id: "reliability", name: "Reliability", emojiIcon: "🛡️" },
    { id: "people", name: "People", emojiIcon: "👥" },
  ];

  const testSkillMatrix = [
    { skillId: "arch", proficiency: "working", capability: "scale" },
    {
      skillId: "devops",
      proficiency: "foundational",
      capability: "reliability",
    },
    { skillId: "collab", proficiency: "working", capability: "people" },
  ];

  describe("deriveChecklist", () => {
    it("returns both checklist types for skills with stage data", () => {
      const { readChecklist, confirmChecklist } = deriveChecklist({
        stageId: "plan",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // Should include arch skill's plan.readChecklist items
      const archRead = readChecklist.find((c) => c.skill.id === "arch");
      assert.ok(archRead);
      assert.deepStrictEqual(archRead.items, [
        "Gather requirements",
        "Design components",
      ]);
      assert.strictEqual(archRead.capability.emojiIcon, "📐");

      // Should include arch skill's plan.confirmChecklist items
      const archConfirm = confirmChecklist.find((c) => c.skill.id === "arch");
      assert.ok(archConfirm);
      assert.deepStrictEqual(archConfirm.items, [
        "Architecture documented",
        "Trade-offs explicit",
      ]);
      assert.strictEqual(archConfirm.capability.emojiIcon, "📐");
    });

    it("excludes skills without agent.stages", () => {
      const { readChecklist, confirmChecklist } = deriveChecklist({
        stageId: "code",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // collab skill has no agent section
      const collabRead = readChecklist.find((c) => c.skill.id === "collab");
      assert.strictEqual(collabRead, undefined);
      const collabConfirm = confirmChecklist.find(
        (c) => c.skill.id === "collab",
      );
      assert.strictEqual(collabConfirm, undefined);
    });

    it("excludes skills without data for the requested stage", () => {
      const { readChecklist, confirmChecklist } = deriveChecklist({
        stageId: "plan",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // devops skill only has code stage
      const devopsRead = readChecklist.find((c) => c.skill.id === "devops");
      assert.strictEqual(devopsRead, undefined);
      const devopsConfirm = confirmChecklist.find(
        (c) => c.skill.id === "devops",
      );
      assert.strictEqual(devopsConfirm, undefined);
    });

    it("returns empty arrays for unknown stage", () => {
      const { readChecklist, confirmChecklist } = deriveChecklist({
        stageId: "unknown",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      assert.deepStrictEqual(readChecklist, []);
      assert.deepStrictEqual(confirmChecklist, []);
    });

    it("returns empty arrays for review stage", () => {
      // Review stage shows completion criteria, not handoff criteria
      const { readChecklist, confirmChecklist } = deriveChecklist({
        stageId: "review",
        skillMatrix: testSkillMatrix,
        skills: testSkillsWithStages,
        capabilities: testCapabilities,
      });

      // arch and devops don't have review stage defined
      assert.deepStrictEqual(readChecklist, []);
      assert.deepStrictEqual(confirmChecklist, []);
    });
  });

  describe("formatChecklistMarkdown", () => {
    it("formats checklist as markdown grouped by skill", () => {
      const checklist = [
        {
          skill: { id: "arch", name: "Architecture" },
          capability: { id: "scale", name: "Scale", emojiIcon: "📐" },
          items: ["Item 1", "Item 2"],
        },
      ];

      const markdown = formatChecklistMarkdown(checklist);
      assert.ok(markdown.includes("**📐 Architecture**"));
      assert.ok(markdown.includes("- [ ] Item 1"));
      assert.ok(markdown.includes("- [ ] Item 2"));
    });

    it("returns empty string for empty checklist", () => {
      const markdown = formatChecklistMarkdown([]);
      assert.strictEqual(markdown, "");
    });
  });
});

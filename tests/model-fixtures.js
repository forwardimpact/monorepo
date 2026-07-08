import {
  createTestSkill,
  createTestBehaviour,
  createTestDiscipline,
  createTestTrack,
  createTestLevel,
  createTestDriver,
  createTestCapability,
} from "@forwardimpact/libmock";

import { Capability } from "@forwardimpact/libskill/levels";

export const testSkills = [
  createTestSkill({
    id: "skill_a",
    name: "Skill A",
    capability: Capability.SCALE,
  }),
  createTestSkill({
    id: "skill_b",
    name: "Skill B",
    capability: Capability.AI,
    proficiencyDescriptions: {},
  }),
  createTestSkill({
    id: "skill_c",
    name: "Skill C",
    capability: Capability.PEOPLE,
    proficiencyDescriptions: {},
  }),
];

export const testBehaviours = [
  createTestBehaviour({ id: "behaviour_x", name: "Behaviour X" }),
  createTestBehaviour({
    id: "behaviour_y",
    name: "Behaviour Y",
    maturityDescriptions: {},
  }),
];

export const testDiscipline = createTestDiscipline({
  id: "test_discipline",
  specialization: "Test Engineering",
  roleTitle: "Test Engineer",
  coreSkills: ["skill_a"],
  supportingSkills: ["skill_b"],
  broadSkills: ["skill_c"],
  behaviourModifiers: { behaviour_x: 1 },
  validTracks: [null, "test_track"],
});

export const testTrack = createTestTrack({
  id: "test_track",
  name: "Test Track",
  skillModifiers: { scale: 1, ai: -1 },
  behaviourModifiers: { behaviour_y: 1 },
  assessmentWeights: { skillWeight: 0.6, behaviourWeight: 0.4 },
});

export const testLevel = createTestLevel({
  id: "test_level",
  ordinalRank: 3,
  baseSkillProficiencies: {
    core: "practitioner",
    supporting: "working",
    broad: "foundational",
  },
  baseBehaviourMaturity: "practicing",
});

export const testDrivers = [
  createTestDriver({
    id: "driver_1",
    name: "Test Driver",
    contributingSkills: ["skill_a", "skill_b"],
    contributingBehaviours: ["behaviour_x"],
  }),
];

export const testCategories = [
  createTestCapability({
    id: "scale",
    name: "Scale",
    emojiIcon: "\u{1F4D0}",
    ordinalRank: 1,
    professionalResponsibilities: {
      awareness: "Follow established patterns",
      foundational: "Contribute to scalable designs",
      working: "Design scalable components",
      practitioner: "Lead architectural decisions",
      expert: "Define organizational standards",
    },
  }),
  createTestCapability({
    id: "ai",
    name: "AI",
    emojiIcon: "\u{1F916}",
    ordinalRank: 2,
    professionalResponsibilities: {
      awareness: "Use AI tools as directed",
      foundational: "Apply AI tools effectively",
      working: "Integrate AI capabilities",
      practitioner: "Design AI-augmented workflows",
      expert: "Shape organizational AI strategy",
    },
  }),
  createTestCapability({
    id: "people",
    name: "People",
    emojiIcon: "\u{1F465}",
    ordinalRank: 3,
  }),
];

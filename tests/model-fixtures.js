import { Capability } from "@forwardimpact/map/levels";

export const testSkills = [
  {
    id: "skill_a",
    name: "Skill A",
    capability: Capability.SCALE,
    description: "A scale skill",
    proficiencyDescriptions: {
      awareness: "Basic awareness",
      foundational: "Can apply basics",
      working: "Works independently",
      practitioner: "Guides others",
      expert: "Industry expert",
    },
  },
  {
    id: "skill_b",
    name: "Skill B",
    capability: Capability.AI,
    description: "An AI skill",
    proficiencyDescriptions: {},
  },
  {
    id: "skill_c",
    name: "Skill C",
    capability: Capability.PEOPLE,
    description: "A people skill",
    proficiencyDescriptions: {},
  },
];

export const testBehaviours = [
  {
    id: "behaviour_x",
    name: "Behaviour X",
    description: "First behaviour",
    maturityDescriptions: {
      emerging: "Just starting",
      developing: "Growing",
      practicing: "Consistent",
      role_modeling: "Exemplary",
    },
  },
  {
    id: "behaviour_y",
    name: "Behaviour Y",
    description: "Second behaviour",
    maturityDescriptions: {},
  },
];

export const testDiscipline = {
  id: "test_discipline",
  specialization: "Test Engineering",
  roleTitle: "Test Engineer",
  description: "A test discipline",
  coreSkills: ["skill_a"],
  supportingSkills: ["skill_b"],
  broadSkills: ["skill_c"],
  behaviourModifiers: { behaviour_x: 1 },
  isProfessional: true,
  isManagement: false,
  validTracks: [null, "test_track"],
};

export const testTrack = {
  id: "test_track",
  name: "Test Track",
  description: "A test track",
  skillModifiers: {
    scale: 1,
    ai: -1,
  },
  behaviourModifiers: { behaviour_y: 1 },
  assessmentWeights: {
    skillWeight: 0.6,
    behaviourWeight: 0.4,
  },
};

export const testLevel = {
  id: "test_level",
  professionalTitle: "Level III",
  managementTitle: "Manager",
  typicalExperienceRange: "5-8",
  ordinalRank: 3,
  baseSkillProficiencies: {
    primary: "practitioner",
    secondary: "working",
    broad: "foundational",
  },
  baseBehaviourMaturity: "practicing",
  expectations: {
    impactScope: "Team level",
    autonomyExpectation: "High",
    influenceScope: "Team",
    complexityHandled: "Moderate",
  },
};

export const testDrivers = [
  {
    id: "driver_1",
    name: "Test Driver",
    description: "A test driver",
    contributingSkills: ["skill_a", "skill_b"],
    contributingBehaviours: ["behaviour_x"],
  },
];

export const testCategories = [
  {
    id: "scale",
    name: "Scale",
    emojiIcon: "\u{1F4D0}",
    order: 1,
    description: "Building systems that grow gracefully",
    professionalResponsibilities: {
      awareness: "Follow established patterns",
      foundational: "Contribute to scalable designs",
      working: "Design scalable components",
      practitioner: "Lead architectural decisions",
      expert: "Define organizational standards",
    },
    managementResponsibilities: {
      awareness: "Understand technical patterns",
      foundational: "Support scalable designs",
      working: "Facilitate scalable solutions",
      practitioner: "Lead architectural strategy",
      expert: "Define organizational standards",
    },
  },
  {
    id: "ai",
    name: "AI",
    emojiIcon: "\u{1F916}",
    order: 2,
    description: "Leveraging artificial intelligence",
    professionalResponsibilities: {
      awareness: "Use AI tools as directed",
      foundational: "Apply AI tools effectively",
      working: "Integrate AI capabilities",
      practitioner: "Design AI-augmented workflows",
      expert: "Shape organizational AI strategy",
    },
    managementResponsibilities: {
      awareness: "Understand AI capabilities",
      foundational: "Enable AI tool adoption",
      working: "Champion AI workflows",
      practitioner: "Drive AI strategy",
      expert: "Shape organizational AI strategy",
    },
  },
  {
    id: "people",
    name: "People",
    emojiIcon: "\u{1F465}",
    order: 3,
    description: "Growing individuals and teams",
    professionalResponsibilities: {
      awareness: "Contribute positively to team dynamics",
      foundational: "Support teammates",
      working: "Mentor junior team members",
      practitioner: "Coach and develop team members",
      expert: "Develop leaders",
    },
    managementResponsibilities: {
      awareness: "Support team dynamics",
      foundational: "Build team cohesion",
      working: "Develop team members",
      practitioner: "Lead team development",
      expert: "Develop leaders",
    },
  },
];

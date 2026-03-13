/**
 * Pathway test fixtures for creating realistic test data
 * Provides mock disciplines, levels, tracks, skills, and behaviours
 */

/**
 * Creates a mock level definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock level
 */
export function createTestLevel(overrides = {}) {
  return {
    id: "mid",
    name: "Mid-Level",
    ordinalRank: 3,
    professionalTitle: "Level III",
    managementTitle: "Manager",
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

/**
 * Creates a set of mock levels spanning junior to senior
 * @returns {object[]} Array of mock levels
 */
export function createTestLevels() {
  return [
    createTestLevel({
      id: "junior",
      name: "Junior",
      ordinalRank: 1,
      professionalTitle: "Level I",
      managementTitle: "Team Lead",
      baseSkillProficiencies: {
        primary: "foundational",
        secondary: "awareness",
        broad: "awareness",
      },
      baseBehaviourMaturity: "emerging",
    }),
    createTestLevel({
      id: "mid",
      name: "Mid-Level",
      ordinalRank: 3,
      professionalTitle: "Level III",
      managementTitle: "Manager",
      baseSkillProficiencies: {
        primary: "working",
        secondary: "foundational",
        broad: "awareness",
      },
      baseBehaviourMaturity: "developing",
    }),
    createTestLevel({
      id: "senior",
      name: "Senior",
      ordinalRank: 5,
      professionalTitle: "Senior",
      managementTitle: "Senior Manager",
      baseSkillProficiencies: {
        primary: "practitioner",
        secondary: "working",
        broad: "foundational",
      },
      baseBehaviourMaturity: "practicing",
    }),
    createTestLevel({
      id: "staff",
      name: "Staff",
      ordinalRank: 7,
      professionalTitle: "Staff",
      managementTitle: "Director",
      baseSkillProficiencies: {
        primary: "expert",
        secondary: "practitioner",
        broad: "working",
      },
      baseBehaviourMaturity: "role_modeling",
    }),
  ];
}

/**
 * Creates a mock skill definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock skill
 */
export function createTestSkill(overrides = {}) {
  return {
    id: "test_skill",
    name: "Test Skill",
    capability: "delivery",
    isHumanOnly: false,
    proficiencyDescriptions: {
      awareness: "Basic awareness",
      foundational: "Foundational understanding",
      working: "Working proficiency",
      practitioner: "Practitioner level",
      expert: "Expert level",
    },
    ...overrides,
  };
}

/**
 * Creates a set of mock skills across capabilities
 * @returns {object[]} Array of mock skills
 */
export function createTestSkills() {
  return [
    createTestSkill({
      id: "coding",
      name: "Coding",
      capability: "delivery",
    }),
    createTestSkill({
      id: "testing",
      name: "Testing",
      capability: "delivery",
    }),
    createTestSkill({
      id: "architecture",
      name: "Architecture",
      capability: "scale",
    }),
    createTestSkill({
      id: "observability",
      name: "Observability",
      capability: "scale",
    }),
    createTestSkill({
      id: "ai_tools",
      name: "AI Tools",
      capability: "ai",
    }),
    createTestSkill({
      id: "mentoring",
      name: "Mentoring",
      capability: "delivery",
      isHumanOnly: true,
    }),
  ];
}

/**
 * Creates a mock discipline definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock discipline
 */
export function createTestDiscipline(overrides = {}) {
  return {
    id: "software_engineering",
    name: "Software Engineering",
    roleTitle: "Software Engineer",
    isProfessional: true,
    isManagement: false,
    coreSkills: ["coding", "testing"],
    supportingSkills: ["architecture"],
    broadSkills: ["observability"],
    behaviourModifiers: {},
    validTracks: [],
    ...overrides,
  };
}

/**
 * Creates a mock track definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock track
 */
export function createTestTrack(overrides = {}) {
  return {
    id: "platform",
    name: "Platform",
    skillModifiers: { scale: 1, delivery: -1 },
    behaviourModifiers: {},
    ...overrides,
  };
}

/**
 * Creates a mock behaviour definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock behaviour
 */
export function createTestBehaviour(overrides = {}) {
  return {
    id: "collaboration",
    name: "Collaboration",
    maturityDescriptions: {
      emerging: "Beginning to collaborate",
      developing: "Developing collaboration",
      practicing: "Practicing collaboration",
      role_modeling: "Role modeling collaboration",
      exemplifying: "Exemplifying collaboration",
    },
    ...overrides,
  };
}

/**
 * Creates a set of mock behaviours
 * @returns {object[]} Array of mock behaviours
 */
export function createTestBehaviours() {
  return [
    createTestBehaviour({ id: "collaboration", name: "Collaboration" }),
    createTestBehaviour({ id: "communication", name: "Communication" }),
    createTestBehaviour({ id: "leadership", name: "Leadership" }),
  ];
}

/**
 * Creates a mock capability definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock capability
 */
export function createTestCapability(overrides = {}) {
  return {
    id: "delivery",
    name: "Delivery",
    emojiIcon: "🚀",
    ordinalRank: 1,
    professionalResponsibilities: {
      foundational: "Delivers assigned tasks",
      working: "Delivers features independently",
      practitioner: "Leads delivery across team",
      expert: "Defines delivery strategy",
    },
    managementResponsibilities: {
      foundational: "Manages delivery timelines",
      working: "Owns team delivery",
      practitioner: "Leads multi-team delivery",
      expert: "Shapes delivery culture",
    },
    ...overrides,
  };
}

/**
 * Creates a mock driver definition
 * @param {object} overrides - Properties to override
 * @returns {object} Mock driver
 */
export function createTestDriver(overrides = {}) {
  return {
    id: "velocity",
    name: "Velocity",
    contributingSkills: ["coding", "testing"],
    contributingBehaviours: ["collaboration"],
    ...overrides,
  };
}

/**
 * Creates a mock skill matrix entry
 * @param {object} overrides - Properties to override
 * @returns {object} Mock skill matrix entry
 */
export function createTestSkillEntry(overrides = {}) {
  return {
    skillId: "coding",
    skillName: "Coding",
    capability: "delivery",
    isHumanOnly: false,
    type: "primary",
    proficiency: "working",
    proficiencyDescription: "Working proficiency",
    ...overrides,
  };
}

/**
 * Creates a mock behaviour profile entry
 * @param {object} overrides - Properties to override
 * @returns {object} Mock behaviour profile entry
 */
export function createTestBehaviourEntry(overrides = {}) {
  return {
    behaviourId: "collaboration",
    behaviourName: "Collaboration",
    maturity: "developing",
    maturityDescription: "Developing collaboration",
    ...overrides,
  };
}

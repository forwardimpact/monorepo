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
      core: "working",
      supporting: "foundational",
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
        core: "foundational",
        supporting: "awareness",
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
        core: "working",
        supporting: "foundational",
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
        core: "practitioner",
        supporting: "working",
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
        core: "expert",
        supporting: "practitioner",
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
    type: "core",
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

/**
 * Creates a set of mock drivers
 * @returns {object[]}
 */
export function createTestDrivers() {
  return [
    createTestDriver({
      id: "velocity",
      name: "Velocity",
      contributingSkills: ["coding", "testing"],
      contributingBehaviours: ["collaboration"],
    }),
    createTestDriver({
      id: "quality",
      name: "Quality",
      contributingSkills: ["testing", "architecture"],
      contributingBehaviours: ["communication"],
    }),
  ];
}

/**
 * Creates a set of mock capabilities spanning delivery / scale / ai.
 * @returns {object[]}
 */
export function createTestCapabilities() {
  return [
    createTestCapability({ id: "delivery", name: "Delivery", ordinalRank: 1 }),
    createTestCapability({ id: "scale", name: "Scale", ordinalRank: 2 }),
    createTestCapability({ id: "ai", name: "AI", ordinalRank: 3 }),
  ];
}

/**
 * Creates a set of mock tracks.
 * @returns {object[]}
 */
export function createTestTracks() {
  return [
    createTestTrack({
      id: "platform",
      name: "Platform",
      skillModifiers: { scale: 1, delivery: -1 },
    }),
    createTestTrack({
      id: "forward_deployed",
      name: "Forward Deployed",
      skillModifiers: { delivery: 1, scale: -1 },
    }),
  ];
}

/**
 * Creates a set of mock disciplines.
 * @returns {object[]}
 */
export function createTestDisciplines() {
  return [
    createTestDiscipline({
      id: "software_engineering",
      name: "Software Engineering",
      roleTitle: "Software Engineer",
    }),
  ];
}

/**
 * Builds a complete mock standard (capabilities, skills, disciplines, tracks,
 * drivers, behaviours, levels) with sensible defaults. Per-slice overrides
 * replace the default for that slice entirely.
 *
 * @param {object} [overrides]
 * @param {object[]} [overrides.capabilities]
 * @param {object[]} [overrides.skills]
 * @param {object[]} [overrides.disciplines]
 * @param {object[]} [overrides.tracks]
 * @param {object[]} [overrides.drivers]
 * @param {object[]} [overrides.behaviours]
 * @param {object[]} [overrides.levels]
 * @returns {object} Agent-aligned engineering standard with all slices populated.
 */
export function createTestStandard(overrides = {}) {
  return {
    capabilities: overrides.capabilities ?? createTestCapabilities(),
    skills: overrides.skills ?? createTestSkills(),
    disciplines: overrides.disciplines ?? createTestDisciplines(),
    tracks: overrides.tracks ?? createTestTracks(),
    drivers: overrides.drivers ?? createTestDrivers(),
    behaviours: overrides.behaviours ?? createTestBehaviours(),
    levels: overrides.levels ?? createTestLevels(),
  };
}

/**
 * Creates a mock person (activity layer / people roster entry).
 * @param {object} [overrides]
 * @returns {object}
 */
export function createTestPerson(overrides = {}) {
  return {
    id: "p-alice",
    name: "Alice",
    email: "alice@example.com",
    level: "mid",
    discipline: "software_engineering",
    track: "platform",
    ...overrides,
  };
}

/**
 * Creates a mock roster (team snapshot).
 * @param {object} [overrides]
 * @returns {object}
 */
export function createTestRoster(overrides = {}) {
  return {
    team: "t-alpha",
    members: [createTestPerson()],
    ...overrides,
  };
}

/**
 * Creates a mock evidence row shared across map and landmark tests.
 * @param {object} [overrides]
 * @returns {object}
 */
export function createTestEvidenceRow(overrides = {}) {
  return {
    skill_id: "coding",
    level_id: "mid",
    matched: true,
    artifact_id: "art-1",
    created_at: "2026-01-01T00:00:00Z",
    github_artifacts: [],
    ...overrides,
  };
}

/**
 * Creates a mock skill augmented with per-level markers (human + agent arrays).
 * @param {object} [overrides]
 * @returns {object}
 */
export function createTestSkillWithMarkers(overrides = {}) {
  return {
    ...createTestSkill(),
    markers: {
      foundational: { human: ["writes simple code"], agent: [] },
      working: { human: ["owns features"], agent: ["reviews PRs"] },
      practitioner: { human: ["mentors peers"], agent: [] },
      expert: { human: ["shapes strategy"], agent: [] },
    },
    ...overrides,
  };
}

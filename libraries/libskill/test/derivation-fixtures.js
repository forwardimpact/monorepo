export function makeDiscipline(overrides = {}) {
  return {
    id: "software_engineering",
    roleTitle: "Software Engineer",
    specialization: "Software Engineering",
    isManagement: false,
    isProfessional: true,
    coreSkills: ["coding", "testing"],
    supportingSkills: ["ci_cd", "monitoring"],
    broadSkills: ["documentation"],
    behaviourModifiers: {},
    validTracks: [],
    ...overrides,
  };
}

export function makeManagementDiscipline(overrides = {}) {
  return makeDiscipline({
    id: "engineering_management",
    roleTitle: "Engineering",
    specialization: "Engineering Management",
    isManagement: true,
    isProfessional: false,
    coreSkills: ["people_management", "delivery_mgmt"],
    supportingSkills: ["process_design"],
    broadSkills: ["coding"],
    behaviourModifiers: { collaboration: 1 },
    validTracks: [null, "platform"],
    ...overrides,
  });
}

export function makeLevel(overrides = {}) {
  return {
    id: "level_3",
    professionalTitle: "Level III",
    managementTitle: "Manager",
    ordinalRank: 3,
    baseSkillProficiencies: {
      primary: "working",
      secondary: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: {
      impactScope: "team",
      autonomyExpectation: "independently",
      influenceScope: "team",
      complexityHandled: "moderate",
    },
    ...overrides,
  };
}

export function makeSeniorLevel(overrides = {}) {
  return makeLevel({
    id: "level_5",
    professionalTitle: "Staff",
    managementTitle: "Director",
    ordinalRank: 5,
    baseSkillProficiencies: {
      primary: "practitioner",
      secondary: "working",
      broad: "foundational",
    },
    baseBehaviourMaturity: "practicing",
    ...overrides,
  });
}

export function makeJuniorLevel(overrides = {}) {
  return makeLevel({
    id: "level_1",
    professionalTitle: "Level I",
    managementTitle: "Associate",
    ordinalRank: 1,
    baseSkillProficiencies: {
      primary: "foundational",
      secondary: "awareness",
      broad: "awareness",
    },
    baseBehaviourMaturity: "emerging",
    ...overrides,
  });
}

export function makeTrack(overrides = {}) {
  return {
    id: "platform",
    name: "Platform",
    description: "Platform engineering track",
    skillModifiers: { scale: 1 },
    behaviourModifiers: { collaboration: 1 },
    ...overrides,
  };
}

export function makeSkills() {
  return [
    {
      id: "coding",
      name: "Coding",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands basic coding",
        foundational: "Writes simple code",
        working: "Writes production code",
        practitioner: "Designs systems",
        expert: "Defines coding standards",
      },
    },
    {
      id: "testing",
      name: "Testing",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands testing",
        foundational: "Writes unit tests",
        working: "Designs test strategies",
        practitioner: "Leads testing practice",
        expert: "Defines testing culture",
      },
    },
    {
      id: "ci_cd",
      name: "CI/CD",
      capability: "delivery",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands CI/CD",
        foundational: "Uses pipelines",
        working: "Configures pipelines",
        practitioner: "Designs CI/CD systems",
        expert: "Defines CI/CD strategy",
      },
    },
    {
      id: "monitoring",
      name: "Monitoring",
      capability: "reliability",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands monitoring",
        foundational: "Uses dashboards",
        working: "Configures alerts",
        practitioner: "Designs observability",
        expert: "Defines monitoring strategy",
      },
    },
    {
      id: "documentation",
      name: "Documentation",
      capability: "documentation",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Reads docs",
        foundational: "Writes basic docs",
        working: "Maintains documentation",
      },
    },
    {
      id: "capacity_planning",
      name: "Capacity Planning",
      capability: "scale",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands capacity",
        foundational: "Estimates capacity",
        working: "Plans capacity",
        practitioner: "Leads capacity planning",
        expert: "Defines capacity strategy",
      },
    },
    {
      id: "load_balancing",
      name: "Load Balancing",
      capability: "scale",
      isHumanOnly: false,
      proficiencyDescriptions: {
        awareness: "Understands load balancing",
        foundational: "Configures basic LB",
        working: "Designs LB strategies",
      },
    },
    {
      id: "people_management",
      name: "People Management",
      capability: "people",
      isHumanOnly: true,
      proficiencyDescriptions: {},
    },
    {
      id: "delivery_mgmt",
      name: "Delivery Management",
      capability: "process",
      isHumanOnly: false,
      proficiencyDescriptions: {},
    },
    {
      id: "process_design",
      name: "Process Design",
      capability: "process",
      isHumanOnly: false,
      proficiencyDescriptions: {},
    },
  ];
}

export function makeBehaviours() {
  return [
    {
      id: "collaboration",
      name: "Collaboration",
      maturityDescriptions: {
        emerging: "Works with others",
        developing: "Contributes to team",
        practicing: "Facilitates collaboration",
        role_modeling: "Models collaboration",
        exemplifying: "Shapes collaborative culture",
      },
    },
    {
      id: "ownership",
      name: "Ownership",
      maturityDescriptions: {
        emerging: "Takes responsibility",
        developing: "Owns deliverables",
        practicing: "Owns outcomes",
        role_modeling: "Models ownership",
        exemplifying: "Shapes ownership culture",
      },
    },
  ];
}

export function makeCapabilities() {
  return [
    {
      id: "delivery",
      name: "Delivery",
      emojiIcon: "\u{1F680}",
      ordinalRank: 1,
      professionalResponsibilities: {
        foundational: "Delivers assigned tasks",
        working: "Delivers features independently",
        practitioner: "Leads delivery across teams",
        expert: "Defines delivery strategy",
      },
      managementResponsibilities: {
        foundational: "Supports delivery",
        working: "Manages delivery",
        practitioner: "Leads delivery org-wide",
        expert: "Defines delivery culture",
      },
    },
    {
      id: "scale",
      name: "Scale",
      emojiIcon: "\u{1F4C8}",
      ordinalRank: 2,
      professionalResponsibilities: {
        foundational: "Understands scale concerns",
        working: "Designs for scale",
        practitioner: "Leads scale initiatives",
        expert: "Defines scale strategy",
      },
      managementResponsibilities: {},
    },
    {
      id: "reliability",
      name: "Reliability",
      emojiIcon: "\u{1F6E1}\uFE0F",
      ordinalRank: 3,
      professionalResponsibilities: {
        foundational: "Follows reliability practices",
        working: "Implements reliability",
        practitioner: "Leads reliability",
        expert: "Defines reliability strategy",
      },
      managementResponsibilities: {},
    },
    {
      id: "documentation",
      name: "Documentation",
      emojiIcon: "\u{1F4DD}",
      ordinalRank: 4,
      professionalResponsibilities: {
        foundational: "Writes basic docs",
        working: "Maintains documentation",
        practitioner: "Leads documentation practice",
        expert: "Defines documentation strategy",
      },
      managementResponsibilities: {},
    },
  ];
}

export function makeDrivers() {
  return [
    {
      id: "velocity",
      name: "Velocity",
      contributingSkills: ["coding", "testing", "ci_cd"],
      contributingBehaviours: ["ownership"],
    },
    {
      id: "stability",
      name: "Stability",
      contributingSkills: ["monitoring", "capacity_planning"],
      contributingBehaviours: ["collaboration", "ownership"],
    },
  ];
}

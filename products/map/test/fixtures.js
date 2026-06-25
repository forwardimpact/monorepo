/**
 * Shared test fixtures for products/map/test/.
 *
 * Any constant that repeats across two or more tests (or two or more files)
 * lives here so per-test files stay minimal and stay in sync.
 */

/**
 * Minimal but complete standard keyed around a "delivery" capability,
 * "planning" skill, "platform" track, "quality" driver, "systems-thinking"
 * behaviour, "software-engineering" discipline, and a J040 level.
 *
 * Shared by exporter.test.js and pipeline.test.js — both assert on the same
 * IRIs (skill/planning, capability/delivery, etc.), so the fixture must keep
 * these IDs stable.
 */
export const DATA = {
  capabilities: [
    {
      id: "delivery",
      name: "Delivery",
      description: "Shipping value.",
      professionalResponsibilities: { working: "Own delivery." },
    },
  ],
  skills: [
    {
      id: "planning",
      name: "Planning",
      capability: "delivery",
      description: "Plan work.",
      proficiencyDescriptions: { working: "..." },
      toolReferences: [
        {
          name: "Linear",
          url: "https://linear.app",
          description: "Issue tracker.",
          useWhen: "Always.",
        },
      ],
    },
  ],
  disciplines: [
    {
      id: "software-engineering",
      specialization: "Software Engineering",
      coreSkills: ["planning"],
      description: "...",
    },
  ],
  tracks: [
    {
      id: "platform",
      name: "Platform",
      description: "...",
      skillModifiers: { planning: 1 },
    },
  ],
  drivers: [
    {
      id: "quality",
      name: "Quality",
      description: "...",
      contributingSkills: ["planning"],
    },
  ],
  behaviours: [
    {
      id: "systems-thinking",
      name: "Think in Systems",
      description: "...",
      maturityDescriptions: { emerging: "..." },
    },
  ],
  levels: [
    {
      id: "J040",
      professionalTitle: "Level I",
      qualificationSummary: "Entry.",
      ordinalRank: 1,
    },
  ],
};

/**
 * Pipeline-variant of DATA — no tracks/drivers/behaviours. Kept as a separate
 * constant so pipeline.test.js's end-to-end graph flow remains minimal.
 */
export const PIPELINE_DATA = {
  capabilities: [{ id: "delivery", name: "Delivery", description: "..." }],
  skills: DATA.skills,
  disciplines: DATA.disciplines,
  tracks: [],
  drivers: [],
  behaviours: [],
  levels: DATA.levels,
};

/**
 * People fixtures for validate-people tests. STARTER_DIR exposes J040 as a
 * valid level and "software-engineering" as a valid discipline.
 */
export const PEOPLE_VALID = [
  {
    email: "a@x",
    name: "A",
    discipline: "software-engineering",
    level: "J040",
  },
];

export const PEOPLE_UNKNOWN_LEVEL = [
  {
    email: "a@x",
    name: "A",
    discipline: "software-engineering",
    level: "L999",
  },
];

/**
 * Evidence + artifact factories for transform-evidence.test.js. Kept as
 * factory functions so each test case can customise per-row fields.
 */
export function makeEvidenceRow(overrides = {}) {
  return {
    person_email: "ada@example.com",
    skill_id: "testing",
    proficiency: "working",
    observed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Create a minimal artifact fixture with optional field overrides for evidence transform tests. */
export function makeArtifact(overrides = {}) {
  return {
    artifact_id: "a1",
    email: "ada@example.com",
    artifact_type: "pull_request",
    metadata: { title: "PR" },
    ...overrides,
  };
}

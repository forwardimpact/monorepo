/**
 * Build minimal valid entities for testing.
 * @param {object} overrides
 * @returns {object}
 */
export function buildEntities(overrides = {}) {
  return {
    teams: [{ id: "team_a" }, { id: "team_b" }],
    people: [
      {
        name: "Zeus",
        email: "zeus@acme.com",
        github: "zeus-bio",
        team_id: "team_a",
        is_manager: false,
      },
      {
        name: "Athena",
        email: "athena@acme.com",
        github: "athena-bio",
        team_id: "team_b",
        is_manager: true,
      },
    ],
    standard: {
      proficiencies: ["awareness", "foundational", "working"],
      maturities: ["emerging", "developing"],
      capabilities: [],
      behaviours: [],
      disciplines: [],
      drivers: [{ id: "code-review" }],
    },
    activity: {
      roster: [{ email: "zeus@acme.com" }, { email: "athena@acme.com" }],
      webhook: {
        events: [
          {
            delivery_id: "d1",
            event_type: "push",
            payload: {
              repository: "repo-a",
              sender: { login: "zeus-bio" },
            },
          },
        ],
        keys: [],
      },
      activityTeams: [{ getdx_team_id: "gt1", name: "Team A" }],
      snapshots: [
        {
          snapshot_id: "s1",
          scheduled_for: "2024-01-01",
          completed_at: "2024-01-02",
        },
      ],
      scores: [
        {
          snapshot_id: "s1",
          getdx_team_id: "gt1",
          item_id: "code-review",
          score: 75,
        },
      ],
      evidence: [
        {
          skill_id: "javascript",
          proficiency: "working",
        },
      ],
    },
    ...overrides,
  };
}

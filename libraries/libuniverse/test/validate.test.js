import { describe, test } from "node:test";
import assert from "node:assert";
import { validateCrossContent, ContentValidator } from "../validate.js";

/**
 * Build minimal valid entities for testing.
 * @param {object} overrides
 * @returns {object}
 */
function buildEntities(overrides = {}) {
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
    framework: {
      proficiencies: ["awareness", "foundational", "working"],
      maturities: ["emerging", "developing"],
      capabilities: [],
      behaviours: [],
      disciplines: [],
      drivers: [],
    },
    activity: {
      roster: [{ email: "zeus@acme.com" }, { email: "athena@acme.com" }],
      webhooks: [
        {
          delivery_id: "d1",
          event_type: "push",
          payload: {
            repository: "repo-a",
            sender: { login: "zeus-bio" },
          },
        },
      ],
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
          item_id: "code_review",
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

describe("validateCrossContent", () => {
  describe("pass with valid entities", () => {
    test("returns passed=true for fully valid entities", () => {
      const result = validateCrossContent(buildEntities());
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.failures, 0);
      assert.ok(result.total > 0);
    });

    test("returns check results with names and messages", () => {
      const result = validateCrossContent(buildEntities());
      for (const check of result.checks) {
        assert.ok(check.name, "Check must have a name");
        assert.ok(check.message, "Check must have a message");
        assert.strictEqual(typeof check.passed, "boolean");
      }
    });
  });

  describe("people coverage", () => {
    test("fails when people reference unknown teams", () => {
      const entities = buildEntities({
        people: [
          {
            name: "Zeus",
            email: "zeus@acme.com",
            github: "zeus-bio",
            team_id: "nonexistent_team",
            is_manager: false,
          },
        ],
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "people_coverage");
      assert.strictEqual(check.passed, false);
      assert.ok(check.message.includes("unknown teams"));
    });
  });

  describe("team assignments", () => {
    test("fails when a team has no members", () => {
      const entities = buildEntities({
        teams: [{ id: "team_a" }, { id: "team_b" }, { id: "empty_team" }],
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "team_assignments");
      assert.strictEqual(check.passed, false);
      assert.ok(check.message.includes("no members"));
    });
  });

  describe("manager references", () => {
    test("fails when manager references unknown team", () => {
      const entities = buildEntities({
        people: [
          {
            name: "Athena",
            email: "athena@acme.com",
            github: "athena-bio",
            team_id: "ghost_team",
            is_manager: true,
          },
        ],
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "manager_references");
      assert.strictEqual(check.passed, false);
    });
  });

  describe("github usernames", () => {
    test("fails with duplicate github usernames", () => {
      const entities = buildEntities({
        people: [
          {
            name: "Zeus",
            email: "zeus@acme.com",
            github: "same-user",
            team_id: "team_a",
            is_manager: false,
          },
          {
            name: "Athena",
            email: "athena@acme.com",
            github: "same-user",
            team_id: "team_b",
            is_manager: false,
          },
        ],
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "github_usernames");
      assert.strictEqual(check.passed, false);
      assert.ok(check.message.includes("duplicate"));
    });
  });

  describe("pathway validity", () => {
    test("passes with simple framework config", () => {
      const result = validateCrossContent(buildEntities());
      const check = result.checks.find((c) => c.name === "pathway_validity");
      assert.strictEqual(check.passed, true);
    });

    test("fails when framework has no proficiencies", () => {
      const entities = buildEntities({
        framework: {
          proficiencies: [],
          capabilities: [],
          behaviours: [],
          disciplines: [],
          drivers: [],
        },
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "pathway_validity");
      assert.strictEqual(check.passed, false);
    });

    test("fails when discipline references unknown skill (extended mode)", () => {
      const entities = buildEntities({
        framework: {
          proficiencies: ["awareness"],
          capabilities: [{ id: "cap1", name: "Cap", skills: ["javascript"] }],
          behaviours: [{ id: "collab", name: "Collaboration" }],
          disciplines: [
            {
              id: "backend",
              core: ["nonexistent_skill"],
              supporting: [],
              broad: [],
            },
          ],
          drivers: [],
        },
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "pathway_validity");
      assert.strictEqual(check.passed, false);
      assert.ok(check.message.includes("unknown skill"));
    });

    test("fails when driver references unknown behaviour (extended mode)", () => {
      const entities = buildEntities({
        framework: {
          proficiencies: ["awareness"],
          capabilities: [{ id: "cap1", name: "Cap", skills: ["js"] }],
          behaviours: [{ id: "collab", name: "Collaboration" }],
          disciplines: [],
          drivers: [
            {
              id: "quality",
              skills: ["js"],
              behaviours: ["nonexistent_behaviour"],
            },
          ],
        },
      });
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "pathway_validity");
      assert.strictEqual(check.passed, false);
      assert.ok(check.message.includes("unknown behaviour"));
    });
  });

  describe("roster completeness", () => {
    test("fails when roster is missing people", () => {
      const entities = buildEntities();
      entities.activity.roster = [{ email: "zeus@acme.com" }];
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "roster_completeness");
      assert.strictEqual(check.passed, false);
    });
  });

  describe("webhook checks", () => {
    test("fails with invalid webhook schemas", () => {
      const entities = buildEntities();
      entities.activity.webhooks = [
        { delivery_id: "d1" }, // missing event_type, payload
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find(
        (c) => c.name === "webhook_payload_schemas",
      );
      assert.strictEqual(check.passed, false);
    });

    test("fails with duplicate webhook delivery IDs", () => {
      const entities = buildEntities();
      entities.activity.webhooks = [
        {
          delivery_id: "dup",
          event_type: "push",
          payload: { repository: "r", sender: { login: "zeus-bio" } },
        },
        {
          delivery_id: "dup",
          event_type: "push",
          payload: { repository: "r", sender: { login: "athena-bio" } },
        },
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find(
        (c) => c.name === "webhook_delivery_ids",
      );
      assert.strictEqual(check.passed, false);
    });

    test("fails with unknown webhook sender", () => {
      const entities = buildEntities();
      entities.activity.webhooks = [
        {
          delivery_id: "d1",
          event_type: "push",
          payload: {
            repository: "r",
            sender: { login: "unknown-user" },
          },
        },
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find(
        (c) => c.name === "webhook_sender_usernames",
      );
      assert.strictEqual(check.passed, false);
    });
  });

  describe("score and evidence checks", () => {
    test("fails with invalid driver IDs in scores", () => {
      const entities = buildEntities();
      entities.activity.scores = [
        {
          snapshot_id: "s1",
          getdx_team_id: "gt1",
          item_id: "invalid_driver",
          score: 50,
        },
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find(
        (c) => c.name === "snapshot_score_driver_ids",
      );
      assert.strictEqual(check.passed, false);
    });

    test("fails with scores out of 0-100 range", () => {
      const entities = buildEntities();
      entities.activity.scores = [
        {
          snapshot_id: "s1",
          getdx_team_id: "gt1",
          item_id: "code_review",
          score: 150,
        },
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "score_trajectories");
      assert.strictEqual(check.passed, false);
    });

    test("fails with invalid evidence proficiency", () => {
      const entities = buildEntities();
      entities.activity.evidence = [
        { skill_id: "js", proficiency: "invalid_level" },
      ];
      const result = validateCrossContent(entities);
      const check = result.checks.find(
        (c) => c.name === "evidence_proficiency",
      );
      assert.strictEqual(check.passed, false);
    });

    test("fails with missing evidence skill IDs", () => {
      const entities = buildEntities();
      entities.activity.evidence = [{ proficiency: "working" }];
      const result = validateCrossContent(entities);
      const check = result.checks.find((c) => c.name === "evidence_skill_ids");
      assert.strictEqual(check.passed, false);
    });
  });

  describe("result structure", () => {
    test("returns total count matching number of checks", () => {
      const result = validateCrossContent(buildEntities());
      assert.strictEqual(result.total, result.checks.length);
    });

    test("failures count matches failed checks", () => {
      const entities = buildEntities({
        people: [
          {
            name: "Zeus",
            email: "zeus@acme.com",
            github: "zeus-bio",
            team_id: "nonexistent",
            is_manager: false,
          },
        ],
      });
      const result = validateCrossContent(entities);
      const failedChecks = result.checks.filter((c) => !c.passed);
      assert.strictEqual(result.failures, failedChecks.length);
      assert.strictEqual(result.passed, false);
    });
  });
});

describe("ContentValidator", () => {
  test("throws when logger is not provided", () => {
    assert.throws(() => new ContentValidator(), /logger is required/);
  });

  test("validates entities using validate method", () => {
    const logger = { info() {}, error() {} };
    const validator = new ContentValidator(logger);
    const result = validator.validate(buildEntities());
    assert.strictEqual(result.passed, true);
  });
});

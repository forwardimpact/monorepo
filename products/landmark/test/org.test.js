import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runOrgCommand } from "../src/commands/org.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const PEOPLE = [
  {
    email: "alice@example.com",
    name: "Alice",
    discipline: "software_engineering",
    level: "J040",
    track: null,
    manager_email: null,
  },
  {
    email: "bob@example.com",
    name: "Bob",
    discipline: "software_engineering",
    level: "J060",
    track: "platform",
    manager_email: "alice@example.com",
  },
];

function stubQueries({ org = PEOPLE, team = PEOPLE } = {}) {
  return {
    getOrganization: async () => org,
    getTeam: async (_sb, _email) => team,
  };
}

describe("org show", () => {
  it("returns all people", async () => {
    const result = await runOrgCommand({
      args: ["show"],
      options: {},
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.people.length, 2);
    assert.equal(result.meta.emptyState, undefined);
  });

  it("returns empty state when no people", async () => {
    const result = await runOrgCommand({
      args: ["show"],
      options: {},
      supabase: {},
      format: "text",
      queries: stubQueries({ org: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_ORGANIZATION);
  });
});

describe("org team", () => {
  it("returns team members for a manager", async () => {
    const result = await runOrgCommand({
      args: ["team"],
      options: { manager: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view.team.length, 2);
    assert.equal(result.view.managerEmail, "alice@example.com");
  });

  it("returns empty state when manager has no team", async () => {
    const result = await runOrgCommand({
      args: ["team"],
      options: { manager: "nobody@example.com" },
      supabase: {},
      format: "text",
      queries: stubQueries({ team: [] }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nobody@example.com"));
  });

  it("throws when --manager is missing", async () => {
    await assert.rejects(
      () =>
        runOrgCommand({
          args: ["team"],
          options: {},
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /--manager/,
    );
  });
});

describe("org subcommand validation", () => {
  it("throws for unknown subcommand", async () => {
    await assert.rejects(
      () =>
        runOrgCommand({
          args: ["bogus"],
          options: {},
          supabase: {},
          format: "text",
          queries: stubQueries(),
        }),
      /expected/,
    );
  });
});

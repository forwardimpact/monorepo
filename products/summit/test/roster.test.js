import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseRosterYaml,
  loadRosterFromMap,
  validateRosterAgainstFramework,
} from "../src/roster/index.js";

const MINIMAL_YAML = `
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software_engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software_engineering
        level: J040
`;

const WITH_PROJECT_YAML = `
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software_engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software_engineering
        level: J040

projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6
    - name: External
      job:
        discipline: software_engineering
        level: J060
      allocation: 1.0
`;

test("parseRosterYaml parses minimal YAML into expected shape", () => {
  const roster = parseRosterYaml(MINIMAL_YAML);
  assert.equal(roster.source, "yaml");
  assert.equal(roster.teams.size, 1);
  assert.equal(roster.projects.size, 0);
  const platform = roster.teams.get("platform");
  assert.equal(platform.type, "reporting");
  assert.equal(platform.members.length, 2);
  assert.equal(platform.members[0].name, "Alice");
  assert.equal(platform.members[0].job.track, "platform");
  assert.equal(platform.members[1].job.track, undefined);
});

test("parseRosterYaml resolves email-only project members from reporting teams", () => {
  const roster = parseRosterYaml(WITH_PROJECT_YAML);
  assert.equal(roster.projects.size, 1);
  const migration = roster.projects.get("migration-q2");
  assert.equal(migration.type, "project");
  assert.equal(migration.members.length, 2);
  const alice = migration.members.find((m) => m.email === "alice@example.com");
  assert.equal(alice.name, "Alice");
  assert.equal(alice.job.discipline, "software_engineering");
  assert.equal(alice.job.track, "platform");
  assert.equal(alice.allocation, 0.6);
});

test("parseRosterYaml defaults allocation to 1.0 when omitted for project members", () => {
  const yaml = `
teams:
  a:
    - name: X
      email: x@example.com
      job: { discipline: software_engineering, level: J060 }
projects:
  p:
    - email: x@example.com
`;
  const roster = parseRosterYaml(yaml);
  const project = roster.projects.get("p");
  assert.equal(project.members[0].allocation, 1.0);
});

test("parseRosterYaml rejects allocation on reporting team members", () => {
  const yaml = `
teams:
  a:
    - name: X
      email: x@example.com
      allocation: 0.5
      job: { discipline: software_engineering, level: J060 }
`;
  assert.throws(() => parseRosterYaml(yaml), /allocation is only allowed/);
});

test("parseRosterYaml rejects project member referencing unknown email", () => {
  const yaml = `
teams:
  a:
    - name: X
      email: x@example.com
      job: { discipline: software_engineering, level: J060 }
projects:
  p:
    - email: unknown@example.com
`;
  assert.throws(
    () => parseRosterYaml(yaml),
    /references unknown member by email/,
  );
});

test("parseRosterYaml rejects bare array (no teams wrapper)", () => {
  const yaml = `- name: X\n  email: x@example.com`;
  assert.throws(() => parseRosterYaml(yaml), /bare list/);
});

test("validateRosterAgainstFramework flags unknown discipline/level/track", () => {
  const roster = parseRosterYaml(`
teams:
  a:
    - name: X
      email: x@example.com
      job: { discipline: zzz, level: J999, track: qqq }
`);
  const data = {
    disciplines: [{ id: "software_engineering" }],
    levels: [{ id: "J060" }],
    tracks: [{ id: "platform" }],
  };
  const result = validateRosterAgainstFramework(roster, data);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some((e) => e.code === "UNKNOWN_DISCIPLINE"));
  assert.ok(result.errors.some((e) => e.code === "UNKNOWN_LEVEL"));
  assert.ok(result.errors.some((e) => e.code === "UNKNOWN_TRACK"));
});

test("validateRosterAgainstFramework is clean for a valid roster", () => {
  const roster = parseRosterYaml(MINIMAL_YAML);
  const data = {
    disciplines: [{ id: "software_engineering" }],
    levels: [{ id: "J040" }, { id: "J060" }],
    tracks: [{ id: "platform" }, { id: "forward_deployed" }],
  };
  const result = validateRosterAgainstFramework(roster, data);
  assert.equal(result.errors.length, 0);
});

test("loadRosterFromMap groups people by manager_email", async () => {
  const rows = [
    {
      email: "alice@example.com",
      name: "Alice",
      discipline: "software_engineering",
      level: "J060",
      track: "platform",
      manager_email: "boss@example.com",
    },
    {
      email: "bob@example.com",
      name: "Bob",
      discipline: "software_engineering",
      level: "J040",
      track: null,
      manager_email: "boss@example.com",
    },
    {
      email: "carol@example.com",
      name: "Carol",
      discipline: "software_engineering",
      level: "J060",
      track: null,
      manager_email: "other@example.com",
    },
    // Rows without manager_email are skipped (top of the hierarchy).
    {
      email: "ceo@example.com",
      name: "CEO",
      discipline: "software_engineering",
      level: "J060",
      track: null,
      manager_email: null,
    },
  ];

  const roster = await loadRosterFromMap(
    {},
    { fetchOrganization: async () => rows },
  );

  assert.equal(roster.source, "map");
  assert.equal(roster.teams.size, 2);
  const boss = roster.teams.get("boss@example.com");
  assert.equal(boss.members.length, 2);
  assert.equal(boss.managerEmail, "boss@example.com");
  const other = roster.teams.get("other@example.com");
  assert.equal(other.members.length, 1);
  assert.equal(other.members[0].job.track, undefined);
});

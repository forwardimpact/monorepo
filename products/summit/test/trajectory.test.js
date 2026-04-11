import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

import { parseRosterYaml } from "../src/roster/yaml.js";
import {
  bucketCommitsByQuarter,
  computeTrajectory,
} from "../src/aggregation/trajectory.js";
import { listCommits, showFileAt } from "../src/git/history.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

async function loadData() {
  return createDataLoader().loadAllData(FIXTURE_DATA);
}

test("bucketCommitsByQuarter groups commits by calendar quarter", () => {
  const commits = [
    { sha: "a", date: new Date("2025-01-15T00:00:00Z") },
    { sha: "b", date: new Date("2025-03-20T00:00:00Z") },
    { sha: "c", date: new Date("2025-04-10T00:00:00Z") },
    { sha: "d", date: new Date("2025-08-05T00:00:00Z") },
  ];
  const buckets = bucketCommitsByQuarter(commits);
  const quarters = buckets.map((b) => b.quarter);
  assert.deepEqual(quarters, ["2025-Q1", "2025-Q2", "2025-Q3"]);
  // Q1 keeps the first (newest) commit we saw.
  assert.equal(buckets.find((b) => b.quarter === "2025-Q1").sha, "a");
});

test("bucketCommitsByQuarter limits to maxQuarters", () => {
  const commits = [
    { sha: "a", date: new Date("2025-01-15T00:00:00Z") },
    { sha: "b", date: new Date("2025-04-15T00:00:00Z") },
    { sha: "c", date: new Date("2025-07-15T00:00:00Z") },
  ];
  const buckets = bucketCommitsByQuarter(commits, 2);
  assert.equal(buckets.length, 2);
  assert.deepEqual(
    buckets.map((b) => b.quarter),
    ["2025-Q2", "2025-Q3"],
  );
});

test("listCommits parses injected git log output", async () => {
  const fakeExec = async () => ({
    stdout: "abc123 2025-01-10T00:00:00Z\ndef456 2024-12-01T00:00:00Z\n",
  });
  const commits = await listCommits("summit.yaml", { exec: fakeExec });
  assert.equal(commits.length, 2);
  assert.equal(commits[0].sha, "abc123");
  assert.ok(commits[0].date instanceof Date);
});

test("showFileAt returns stubbed content", async () => {
  const fakeExec = async () => ({ stdout: "teams:\n  a: []\n" });
  const content = await showFileAt("abc123", "summit.yaml", {
    exec: fakeExec,
  });
  assert.ok(content.includes("teams:"));
});

test("computeTrajectory builds quarterly coverage and identifies persistent gaps", async () => {
  const data = await loadData();
  const q1 = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
`);
  const q2 = parseRosterYaml(`
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J060 }
`);

  const trajectory = computeTrajectory({
    historicalRosters: [
      { quarter: "2025-Q1", roster: q1 },
      { quarter: "2025-Q2", roster: q2 },
    ],
    teamId: "a",
    data,
  });

  assert.equal(trajectory.quarters.length, 2);
  assert.equal(trajectory.quarters[0].memberCount, 1);
  assert.equal(trajectory.quarters[1].memberCount, 2);
  assert.equal(trajectory.trends.task_completion, "improving");
  assert.ok(trajectory.persistentGaps.includes("incident_response"));
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decorateRecommendationsWithOutcomes,
  mapSkillsToDrivers,
} from "../src/outcomes/index.js";

const FAKE_DATA = {
  drivers: [
    {
      id: "quality",
      contributingSkills: ["task_completion", "planning"],
    },
  ],
};

test("mapSkillsToDrivers reverses contributingSkills", () => {
  const map = mapSkillsToDrivers(FAKE_DATA);
  assert.deepEqual(map.get("task_completion"), ["quality"]);
  assert.deepEqual(map.get("planning"), ["quality"]);
  assert.equal(map.get("incident_response"), undefined);
});

test("decorateRecommendationsWithOutcomes attaches driverContext", () => {
  const driverScores = new Map();
  driverScores.set("quality", { percentile: 42, vsOrg: -10 });

  const recs = [
    {
      skillId: "task_completion",
      impact: "critical",
      candidates: [],
      driverContext: null,
    },
    {
      skillId: "incident_response",
      impact: "critical",
      candidates: [],
      driverContext: null,
    },
  ];

  const decorated = decorateRecommendationsWithOutcomes(
    recs,
    driverScores,
    FAKE_DATA,
  );
  const task = decorated.find((r) => r.skillId === "task_completion");
  assert.ok(task.driverContext);
  assert.equal(task.driverContext.driverId, "quality");

  const incident = decorated.find((r) => r.skillId === "incident_response");
  assert.equal(incident.driverContext, null);
});

test("decorateRecommendationsWithOutcomes preserves impact tier order", () => {
  const driverScores = new Map();
  driverScores.set("quality", { percentile: 5 });

  const recs = [
    {
      skillId: "coverage_only",
      impact: "coverage-strengthening",
      candidates: [],
      driverContext: null,
    },
    {
      skillId: "task_completion",
      impact: "critical",
      candidates: [],
      driverContext: null,
    },
  ];

  const decorated = decorateRecommendationsWithOutcomes(
    recs,
    driverScores,
    FAKE_DATA,
  );
  // task_completion (critical) must still come first.
  assert.equal(decorated[0].skillId, "task_completion");
});

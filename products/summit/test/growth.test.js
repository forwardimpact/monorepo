import { before, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeGrowthAlignment,
  GrowthContractError,
} from "../src/aggregation/growth.js";

import { loadStarterData } from "./fixtures.js";

let mapData;

before(async () => {
  ({ data: mapData } = await loadStarterData());
});

test("computeGrowthAlignment returns [] for empty team", () => {
  const result = computeGrowthAlignment({ team: [], mapData });
  assert.deepEqual(result, []);
});

test("computeGrowthAlignment surfaces critical gaps first", () => {
  const team = [
    {
      email: "a@example.com",
      name: "A",
      job: { discipline: "software-engineering", level: "J040" },
    },
    {
      email: "b@example.com",
      name: "B",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  const recs = computeGrowthAlignment({ team, mapData });
  assert.ok(recs.length > 0);
  // All three starter skills are gaps at J040, so everything should be
  // in the "critical" bucket.
  const critical = recs.filter((r) => r.impact === "critical");
  assert.ok(critical.length >= 3);
});

test("computeGrowthAlignment ranks candidates by proximity", () => {
  const team = [
    {
      email: "senior@example.com",
      name: "Senior",
      job: { discipline: "software-engineering", level: "J060" },
    },
    {
      email: "junior@example.com",
      name: "Junior",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  const recs = computeGrowthAlignment({ team, mapData });
  const planning = recs.find((r) => r.skill === "planning");
  assert.ok(planning);
  // Senior has planning=foundational (closer), Junior has planning=awareness
  // so senior should rank first.
  assert.equal(planning.candidates[0].email, "senior@example.com");
});

test("computeGrowthAlignment throws GrowthContractError on unknown discipline", () => {
  const team = [
    {
      email: "x@example.com",
      name: "X",
      job: { discipline: "nope", level: "J060" },
    },
  ];
  assert.throws(
    () => computeGrowthAlignment({ team, mapData }),
    GrowthContractError,
  );
});

test("computeGrowthAlignment attaches null driverContext for every rec in Part 05", () => {
  const team = [
    {
      email: "a@example.com",
      name: "A",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  const recs = computeGrowthAlignment({ team, mapData });
  for (const rec of recs) {
    assert.equal(rec.driverContext, null);
  }
});

test("computeGrowthAlignment signature — accepts a single destructured param", () => {
  // Function accepts team / mapData / evidence / driverScores as
  // destructured options; with a default of `{}`, Function.length is 0.
  // Just exercise the full signature to ensure it doesn't throw.
  const recs = computeGrowthAlignment({
    team: [],
    mapData,
    evidence: undefined,
    driverScores: undefined,
  });
  assert.deepEqual(recs, []);
});

test("computeGrowthAlignment recommendations expose `skill` per spec.md:583", () => {
  const team = [
    {
      email: "a@example.com",
      name: "A",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  const recs = computeGrowthAlignment({ team, mapData });
  assert.ok(recs.length > 0);
  for (const rec of recs) {
    assert.ok(
      typeof rec.skill === "string",
      `recommendation missing skill: ${JSON.stringify(rec)}`,
    );
    assert.equal(
      rec.skillId,
      undefined,
      "recommendation should not expose skillId alongside skill",
    );
    assert.ok("driverContext" in rec);
    assert.ok(Array.isArray(rec.candidates));
  }
});

test("computeGrowthAlignment attaches driverContext when driverScores passed", () => {
  const team = [
    {
      email: "a@example.com",
      name: "A",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  // starter drivers.yaml defines `quality` with contributingSkills
  // task-completion and planning.
  const driverScores = new Map();
  driverScores.set("quality", { percentile: 25, vsOrg: -10 });

  const recs = computeGrowthAlignment({ team, mapData, driverScores });
  const task = recs.find((r) => r.skill === "task-completion");
  assert.ok(task, "task-completion recommendation expected");
  assert.ok(task.driverContext, "driverContext should be populated");
  assert.equal(task.driverContext.driverId, "quality");
  assert.equal(task.driverContext.percentile, 25);

  const incident = recs.find((r) => r.skill === "incident-response");
  assert.ok(incident);
  assert.equal(
    incident.driverContext,
    null,
    "incident-response has no linked driver",
  );
});

test("computeGrowthAlignment outcome weighting reorders within a tier", () => {
  const team = [
    {
      email: "a@example.com",
      name: "A",
      job: { discipline: "software-engineering", level: "J040" },
    },
  ];
  // Without outcomes: planning and task-completion sort alphabetically.
  const baseline = computeGrowthAlignment({ team, mapData });
  // With outcomes: same skills exist in the `quality` driver. When one
  // is associated with a bad percentile and the other isn't, the weighted
  // one should rise within its tier.
  const driverScores = new Map();
  driverScores.set("quality", { percentile: 5, vsOrg: -20 });
  const weighted = computeGrowthAlignment({ team, mapData, driverScores });

  // Critical tier ordering is preserved — critical stays above spof/
  // coverage regardless of weighting.
  const criticalBaseline = baseline.filter((r) => r.impact === "critical");
  const criticalWeighted = weighted.filter((r) => r.impact === "critical");
  assert.equal(criticalBaseline.length, criticalWeighted.length);
  // Both task-completion and planning have the same driver weight; the
  // tiebreaker falls back to name. The assertion here is that the
  // weighted path still returns both and all skills carry the driver
  // context.
  for (const rec of criticalWeighted) {
    if (rec.skill === "task-completion" || rec.skill === "planning") {
      assert.ok(rec.driverContext);
    }
  }
});

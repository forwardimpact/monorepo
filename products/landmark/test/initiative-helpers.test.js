import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeInitiativeImpact } from "../src/lib/initiative-helpers.js";

const SNAPSHOTS = [
  { snapshot_id: "snap-q3", scheduled_for: "2024-09-15" },
  { snapshot_id: "snap-q4", scheduled_for: "2024-12-15" },
  { snapshot_id: "snap-q1", scheduled_for: "2025-03-15" },
  { snapshot_id: "snap-q2", scheduled_for: "2025-06-15" },
];

function makeScores(data) {
  const m = new Map();
  for (const [snapId, scores] of Object.entries(data)) {
    m.set(snapId, new Map(Object.entries(scores)));
  }
  return m;
}

describe("computeInitiativeImpact", () => {
  it("computes delta for a completed initiative", () => {
    const completed = [
      {
        id: "init-1",
        name: "Improve estimation",
        scorecard_id: "quality",
        completed_at: "2025-01-10",
      },
    ];

    const scores = makeScores({
      "snap-q3": { quality: 38 },
      "snap-q4": { quality: 42 },
      "snap-q1": { quality: 58 },
      "snap-q2": { quality: 60 },
    });

    const results = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: scores,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].before, 42); // snap-q4 (before completion)
    assert.equal(results[0].after, 58); // snap-q1 (after completion)
    assert.equal(results[0].delta, 16);
  });

  it("returns null delta for initiative without scorecard_id", () => {
    const completed = [
      {
        id: "init-2",
        name: "No scorecard",
        scorecard_id: null,
        completed_at: "2025-01-10",
      },
    ];
    const results = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: makeScores({}),
    });
    assert.equal(results[0].delta, null);
  });

  it("returns null delta when no snapshot before completion", () => {
    const completed = [
      {
        id: "init-3",
        name: "Early",
        scorecard_id: "quality",
        completed_at: "2024-01-01",
      },
    ];
    const results = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: makeScores({}),
    });
    assert.equal(results[0].delta, null);
  });

  it("returns null delta when no snapshot after completion", () => {
    const completed = [
      {
        id: "init-4",
        name: "Late",
        scorecard_id: "quality",
        completed_at: "2025-12-01",
      },
    ];
    const results = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: makeScores({}),
    });
    assert.equal(results[0].delta, null);
  });

  it("returns null delta when score missing in a snapshot", () => {
    const completed = [
      {
        id: "init-5",
        name: "Missing score",
        scorecard_id: "quality",
        completed_at: "2025-01-10",
      },
    ];
    const scores = makeScores({
      "snap-q4": {}, // quality missing
      "snap-q1": { quality: 50 },
    });
    const results = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: scores,
    });
    assert.equal(results[0].delta, null);
  });

  it("produces identical output regardless of snapshot array order", () => {
    const completed = [
      {
        id: "init-1",
        name: "Test",
        scorecard_id: "quality",
        completed_at: "2025-01-10",
      },
    ];
    const scores = makeScores({
      "snap-q4": { quality: 42 },
      "snap-q1": { quality: 58 },
    });

    const result1 = computeInitiativeImpact({
      completed,
      snapshots: SNAPSHOTS,
      scoresBySnapshot: scores,
    });
    const result2 = computeInitiativeImpact({
      completed,
      snapshots: [...SNAPSHOTS].reverse(),
      scoresBySnapshot: scores,
    });

    assert.deepEqual(result1[0].delta, result2[0].delta);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { createMockSupabaseClient } from "@forwardimpact/libmock";

const createFakeClient = ({ rawFiles }) =>
  createMockSupabaseClient({ files: rawFiles });

describe("activity/transform/getdx", () => {
  test("transformAllGetDX imports teams, snapshots, and scores", async () => {
    const rawFiles = {
      "getdx/teams-list/2026.json": JSON.stringify({
        teams: [{ id: "T1", name: "Platform" }],
      }),
      "getdx/snapshots-list/2026.json": JSON.stringify({
        snapshots: [{ id: "S1", completed_at: "2026-01-01" }],
      }),
      "getdx/snapshots-info/S1.json": JSON.stringify({
        snapshot: {
          team_scores: [{ item_id: "D1", item_type: "driver", score: 80 }],
        },
      }),
    };
    const fake = createFakeClient({ rawFiles });
    const result = await transformAllGetDX(fake);
    assert.strictEqual(result.teams, 1);
    assert.strictEqual(result.snapshots, 1);
    assert.strictEqual(result.scores, 1);
    assert.strictEqual(result.errors.length, 0);
  });

  test("returns zero counts for empty storage", async () => {
    const fake = createFakeClient({ rawFiles: {} });
    const result = await transformAllGetDX(fake);
    assert.strictEqual(result.teams, 0);
    assert.strictEqual(result.snapshots, 0);
    assert.strictEqual(result.scores, 0);
    assert.strictEqual(result.errors.length, 0);
  });

  test("skips deleted snapshots", async () => {
    const rawFiles = {
      "getdx/snapshots-list/2026.json": JSON.stringify({
        snapshots: [
          { id: "S1", completed_at: "2026-01-01" },
          { id: "S2", completed_at: "2026-02-01", deleted_at: "2026-03-01" },
        ],
      }),
    };
    const fake = createFakeClient({ rawFiles });
    const result = await transformAllGetDX(fake);
    assert.strictEqual(result.snapshots, 1);
  });
});

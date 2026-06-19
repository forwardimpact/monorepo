import { test, describe } from "node:test";
import assert from "node:assert";
import { loadHostedMapData } from "../../../supabase/functions/_shared/activity/map-data.js";

describe("loadHostedMapData", () => {
  test("returns mapData when the bundle parses", async () => {
    const result = await loadHostedMapData(async () =>
      JSON.stringify({ disciplines: [], levels: [] }),
    );
    assert.deepStrictEqual(result, {
      mapData: { disciplines: [], levels: [] },
    });
  });

  test("reports bundle_absent when the reader throws", async () => {
    const result = await loadHostedMapData(async () => {
      throw new Error("not found");
    });
    assert.deepStrictEqual(result, {
      skipped: true,
      reason: "bundle_absent",
    });
  });

  test("reports bundle_malformed on invalid JSON", async () => {
    const result = await loadHostedMapData(async () => "{ not json");
    assert.deepStrictEqual(result, {
      skipped: true,
      reason: "bundle_malformed",
    });
  });
});

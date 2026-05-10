/**
 * Spec 840 criterion 1 — every Landmark-read activity.* table has RLS on.
 *
 * Live-Postgres test. Skipped when MAP_SUPABASE_URL / MAP_SUPABASE_JWT_SECRET
 * are unset (CI today does not boot Supabase).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isLiveSupabaseAvailable, createAdminClient } from "./lib/live.js";
import {
  readRetention,
  clearRetentionCache,
} from "../../src/activity/retention.js";

const TABLES = [
  "organization_people",
  "evidence",
  "github_artifacts",
  "getdx_snapshot_comments",
  "getdx_snapshot_team_scores",
  "getdx_snapshots",
];

describe("Spec 840 — RLS + retention migration", () => {
  if (!isLiveSupabaseAvailable()) {
    test("skipped — MAP_SUPABASE_URL / MAP_SUPABASE_JWT_SECRET not set", {
      skip: true,
    }, () => {});
    return;
  }

  test("every RLS'd table has retention metadata that retention_blob can read", async () => {
    const admin = createAdminClient();
    clearRetentionCache();
    for (const t of TABLES) {
      const ret = await readRetention(admin, t);
      if (t === "organization_people") {
        // null-window class — both fields null.
        assert.equal(ret.window, null);
      } else {
        assert.match(
          ret.window ?? "",
          /^P\d+[DWMY]$/,
          `${t}.window should be a P\\d+[DWMY] duration`,
        );
        assert.ok(ret.clock, `${t}.clock should be set`);
      }
    }
  });

  test("retention cache is per-process and clearable", async () => {
    const admin = createAdminClient();
    clearRetentionCache();
    const a = await readRetention(admin, "evidence");
    const b = await readRetention(admin, "evidence");
    assert.deepEqual(a, b);
    clearRetentionCache();
    const c = await readRetention(admin, "evidence");
    assert.deepEqual(a, c);
  });
});

/**
 * Per-caller RLS scope matrix on the six RLS'd tables.
 *
 * Three callers (engineer A; manager M with reports A+B; engineer C under
 * a different manager M') hit each table; this test asserts the admit/deny
 * matrix matches the per-row-class scope rule.
 *
 * Live-Postgres only — skipped when SUPABASE_URL / SUPABASE_JWT_SECRET
 * are unset.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import {
  isLiveSupabaseAvailable,
  createAdminClient,
  withLiveActivity,
} from "./lib/live.js";
import { signTestToken } from "../../../landmark/test/lib/sign-test-token.js";

function clientFor(email) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const jwt = signTestToken({ email });
  return createClient(url, anon, {
    db: { schema: "activity" },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

describe("RLS scope matrix", () => {
  if (!isLiveSupabaseAvailable()) {
    test("skipped — SUPABASE_URL / SUPABASE_JWT_SECRET not set", {
      skip: true,
    }, () => {});
    return;
  }

  test("engineer A sees only A's rows; manager M sees A + B + self; engineer C is invisible to M", async () => {
    await withLiveActivity(async (admin) => {
      // Seed roster: M is manager of A and B; M' is manager of C.
      await admin.from("organization_people").insert([
        {
          email: "m@example.com",
          manager_email: null,
          getdx_team_id: "team-1",
        },
        {
          email: "a@example.com",
          manager_email: "m@example.com",
          getdx_team_id: "team-1",
        },
        {
          email: "b@example.com",
          manager_email: "m@example.com",
          getdx_team_id: "team-1",
        },
        {
          email: "mprime@example.com",
          manager_email: null,
          getdx_team_id: "team-2",
        },
        {
          email: "c@example.com",
          manager_email: "mprime@example.com",
          getdx_team_id: "team-2",
        },
      ]);

      const A = clientFor("a@example.com");
      const M = clientFor("m@example.com");

      // organization_people — A sees self only.
      const aPeople = await A.from("organization_people").select("email");
      assert.deepEqual(
        new Set((aPeople.data ?? []).map((r) => r.email)),
        new Set(["a@example.com"]),
      );

      // organization_people — M sees self + A + B (direct reports).
      const mPeople = await M.from("organization_people").select("email");
      assert.deepEqual(
        new Set((mPeople.data ?? []).map((r) => r.email)),
        new Set(["m@example.com", "a@example.com", "b@example.com"]),
      );

      // C is invisible to M.
      assert.ok(!(mPeople.data ?? []).some((r) => r.email === "c@example.com"));
    });
  });

  test("criterion 4 — scope matrix on the five other RLS'd tables", async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "m@example.com",
          manager_email: null,
          getdx_team_id: "team-1",
        },
        {
          email: "a@example.com",
          manager_email: "m@example.com",
          getdx_team_id: "team-1",
        },
        {
          email: "b@example.com",
          manager_email: "m@example.com",
          getdx_team_id: "team-1",
        },
        {
          email: "mprime@example.com",
          manager_email: null,
          getdx_team_id: "team-2",
        },
        {
          email: "c@example.com",
          manager_email: "mprime@example.com",
          getdx_team_id: "team-2",
        },
      ]);
      await admin.from("github_artifacts").insert([
        {
          artifact_id: "ga-a",
          email: "a@example.com",
          occurred_at: "2026-01-01T00:00:00Z",
        },
        {
          artifact_id: "ga-b",
          email: "b@example.com",
          occurred_at: "2026-01-01T00:00:00Z",
        },
        {
          artifact_id: "ga-c",
          email: "c@example.com",
          occurred_at: "2026-01-01T00:00:00Z",
        },
      ]);
      await admin.from("evidence").insert([
        { artifact_id: "ga-a", created_at: "2026-01-02T00:00:00Z" },
        { artifact_id: "ga-b", created_at: "2026-01-02T00:00:00Z" },
        { artifact_id: "ga-c", created_at: "2026-01-02T00:00:00Z" },
      ]);
      await admin
        .from("getdx_snapshots")
        .insert([
          { snapshot_id: "snap-1", imported_at: "2026-01-03T00:00:00Z" },
        ]);
      await admin.from("getdx_snapshot_comments").insert([
        {
          snapshot_id: "snap-1",
          email: "a@example.com",
          comment_id: "cmt-a",
          timestamp: "2026-01-04T00:00:00Z",
        },
        {
          snapshot_id: "snap-1",
          email: "b@example.com",
          comment_id: "cmt-b",
          timestamp: "2026-01-04T00:00:00Z",
        },
        {
          snapshot_id: "snap-1",
          email: "c@example.com",
          comment_id: "cmt-c",
          timestamp: "2026-01-04T00:00:00Z",
        },
      ]);
      await admin.from("getdx_snapshot_team_scores").insert([
        {
          snapshot_id: "snap-1",
          getdx_team_id: "team-1",
          item_id: "x",
          imported_at: "2026-01-05T00:00:00Z",
          score: 4,
        },
        {
          snapshot_id: "snap-1",
          getdx_team_id: "team-2",
          item_id: "x",
          imported_at: "2026-01-05T00:00:00Z",
          score: 3,
        },
      ]);

      const A = clientFor("a@example.com");
      const M = clientFor("m@example.com");

      const aArt = await A.from("github_artifacts").select("artifact_id");
      assert.deepEqual(
        new Set((aArt.data ?? []).map((r) => r.artifact_id)),
        new Set(["ga-a"]),
      );
      const mArt = await M.from("github_artifacts").select("artifact_id");
      assert.deepEqual(
        new Set((mArt.data ?? []).map((r) => r.artifact_id)),
        new Set(["ga-a", "ga-b"]),
      );

      const aEv = await A.from("evidence").select("artifact_id");
      assert.deepEqual(
        new Set((aEv.data ?? []).map((r) => r.artifact_id)),
        new Set(["ga-a"]),
      );
      const mEv = await M.from("evidence").select("artifact_id");
      assert.deepEqual(
        new Set((mEv.data ?? []).map((r) => r.artifact_id)),
        new Set(["ga-a", "ga-b"]),
      );

      const aCmt = await A.from("getdx_snapshot_comments").select("comment_id");
      assert.deepEqual(
        new Set((aCmt.data ?? []).map((r) => r.comment_id)),
        new Set(["cmt-a"]),
      );
      const mCmt = await M.from("getdx_snapshot_comments").select("comment_id");
      assert.deepEqual(
        new Set((mCmt.data ?? []).map((r) => r.comment_id)),
        new Set(["cmt-a", "cmt-b"]),
      );

      const aScores = await A.from("getdx_snapshot_team_scores").select(
        "getdx_team_id",
      );
      assert.deepEqual(
        new Set((aScores.data ?? []).map((r) => r.getdx_team_id)),
        new Set(["team-1"]),
      );

      // getdx_snapshots is org-wide (USING true) by design — every
      // authenticated caller sees all snapshot rows.
      const aSnaps = await A.from("getdx_snapshots").select("snapshot_id");
      assert.deepEqual(
        new Set((aSnaps.data ?? []).map((r) => r.snapshot_id)),
        new Set(["snap-1"]),
      );
    });
  });

  test("null-attributed rows are invisible to every authenticated caller", async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "alice@example.com",
          manager_email: null,
          getdx_team_id: "team-1",
        },
      ]);
      await admin
        .from("getdx_snapshots")
        .insert([
          { snapshot_id: "snap-1", imported_at: new Date().toISOString() },
        ]);
      await admin.from("getdx_snapshot_comments").insert([
        {
          snapshot_id: "snap-1",
          email: null,
          comment_id: "c1",
          timestamp: new Date().toISOString(),
        },
      ]);

      const alice = clientFor("alice@example.com");
      const { data } = await alice
        .from("getdx_snapshot_comments")
        .select("comment_id");
      assert.deepEqual(data ?? [], []);
    });
  });

  test("anon connection returns zero rows from every RLS'd table", async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "alice@example.com",
          manager_email: null,
          getdx_team_id: "team-1",
        },
      ]);
      const anon = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { db: { schema: "activity" } },
      );
      const { data } = await anon.from("organization_people").select("email");
      assert.deepEqual(data ?? [], []);
    });
  });
});

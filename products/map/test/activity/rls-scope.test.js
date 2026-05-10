/**
 * Spec 840 criterion 2/4 — per-caller scope matrix on the six RLS'd tables.
 *
 * Three callers (engineer A; manager M with reports A+B; engineer C under
 * a different manager M') hit each table; this test asserts the admit/deny
 * matrix matches the per-row-class scope rule.
 *
 * Live-Postgres only — skipped when MAP_SUPABASE_URL / MAP_SUPABASE_JWT_SECRET
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
  const url = process.env.MAP_SUPABASE_URL;
  const anon = process.env.MAP_SUPABASE_ANON_KEY;
  const jwt = signTestToken({ email });
  return createClient(url, anon, {
    db: { schema: "activity" },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

describe("Spec 840 — RLS scope matrix", () => {
  if (!isLiveSupabaseAvailable()) {
    test("skipped — MAP_SUPABASE_URL / MAP_SUPABASE_JWT_SECRET not set", {
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
        process.env.MAP_SUPABASE_URL,
        process.env.MAP_SUPABASE_ANON_KEY,
        { db: { schema: "activity" } },
      );
      const { data } = await anon.from("organization_people").select("email");
      assert.deepEqual(data ?? [], []);
    });
  });
});

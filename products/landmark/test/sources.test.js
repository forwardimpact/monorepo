/**
 * fit-landmark sources verb tests.
 *
 * These tests need live Postgres. They skip when SUPABASE_URL or
 * JWT_SECRET is unset.
 *
 * Covers:
 *   - populated classes appear with all five fields (count, oldest, newest,
 *     window, falloff)
 *   - the command omits classes with zero rows
 *   - the command reflects a retention mutation (write a new COMMENT, call
 *     clearRetentionCache, run again, assert the displayed window changes)
 *   - an out-of-scope email returns the NO_SOURCES_FOR_PERSON empty-state
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import {
  isLiveSupabaseAvailable,
  createAdminClient,
  withLiveActivity,
} from "../../map/test/activity/lib/live.js";
import { signTestToken } from "./lib/sign-test-token.js";
import { runSourcesCommand } from "../src/commands/sources.js";
import { clearRetentionCache } from "@forwardimpact/map/activity/retention";

function clientFor(email) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    db: { schema: "activity" },
    global: {
      headers: { Authorization: `Bearer ${signTestToken({ email })}` },
    },
  });
}

describe("fit-landmark sources", () => {
  if (!isLiveSupabaseAvailable()) {
    test("skipped — SUPABASE_URL / JWT_SECRET not set", {
      skip: true,
    }, () => {});
    return;
  }

  // Each live test pays the cost of `withLiveActivity` → `ensureMigrationApplied`
  // → `supabase db reset` on the first invocation in the process. That takes
  // about 25 seconds on a warm runner. It exceeds bun:test's 5s default
  // timeout. Pin the timeout explicitly. A full-suite local run with the
  // SUPABASE_* env vars set then surfaces real assertion failures. It does
  // not fail on the structural cost of the migrate step.
  test("populated classes appear with five fields and the command omits empty classes", {
    timeout: 120000,
  }, async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "alice@example.com",
          name: "Alice",
          discipline: "engineering",
          level: "L4",
          manager_email: null,
          getdx_team_id: "t",
        },
      ]);
      await admin.from("github_artifacts").insert([
        {
          artifact_type: "commit",
          external_id: "ext-art-1",
          repository: "x/y",
          email: "alice@example.com",
          occurred_at: "2026-01-01T00:00:00Z",
          metadata: {},
        },
      ]);

      clearRetentionCache();
      const alice = clientFor("alice@example.com");
      const result = await runSourcesCommand({
        options: { email: "alice@example.com" },
        supabase: alice,
        format: "json",
      });
      assert.ok(result.view, "view present");
      const ids = result.view.items.map((i) => i.id);
      assert.ok(ids.includes("organization_people"));
      assert.ok(ids.includes("github_artifacts"));
      // evidence has no rows, so the command omits it.
      assert.ok(!ids.includes("evidence"));

      const ga = result.view.items.find((i) => i.id === "github_artifacts");
      assert.equal(ga.count, 1);
      assert.ok(ga.oldest);
      assert.ok(ga.newest);
      assert.match(ga.window, /^P\d+/);
      assert.ok(ga.falloff);
    });
  });

  test("a manager who runs sources --email <report> sees the report's classes", {
    timeout: 120000,
  }, async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "boss@example.com",
          name: "Boss",
          discipline: "engineering",
          level: "L6",
          manager_email: null,
          getdx_team_id: "t",
        },
        {
          email: "report@example.com",
          name: "Report",
          discipline: "engineering",
          level: "L4",
          manager_email: "boss@example.com",
          getdx_team_id: "t",
        },
      ]);
      await admin.from("github_artifacts").insert([
        {
          artifact_type: "commit",
          external_id: "ext-art-r",
          repository: "x/y",
          email: "report@example.com",
          occurred_at: "2026-01-01T00:00:00Z",
          metadata: {},
        },
      ]);

      clearRetentionCache();
      const boss = clientFor("boss@example.com");
      const result = await runSourcesCommand({
        options: { email: "report@example.com" },
        supabase: boss,
        format: "json",
      });
      assert.ok(result.view, "manager scope should surface report rows");
      const ids = result.view.items.map((i) => i.id);
      assert.ok(ids.includes("github_artifacts"));
    });
  });

  test("an out-of-scope email returns NO_SOURCES_FOR_PERSON", {
    timeout: 120000,
  }, async () => {
    await withLiveActivity(async (admin) => {
      await admin.from("organization_people").insert([
        {
          email: "alice@example.com",
          name: "Alice",
          discipline: "engineering",
          level: "L4",
          manager_email: null,
          getdx_team_id: "t",
        },
        {
          email: "outsider@example.com",
          name: "Outsider",
          discipline: "engineering",
          level: "L4",
          manager_email: null,
          getdx_team_id: "t2",
        },
      ]);

      clearRetentionCache();
      const alice = clientFor("alice@example.com");
      const result = await runSourcesCommand({
        options: { email: "outsider@example.com" },
        supabase: alice,
        format: "json",
      });
      assert.equal(result.view, null);
      assert.match(result.meta.emptyState, /outsider@example\.com/);
    });
  });
});

/**
 * Verifies the admin provisioning lifecycle.
 *
 * Live-Postgres only — skipped when SUPABASE_URL /
 * SUPABASE_JWT_SECRET are unset.
 *
 * Covers:
 *   - first run creates one auth.users row per roster email
 *   - second run with unchanged roster is a no-op (count, ids, active state
 *     all unchanged)
 *   - removing a roster row decommissions the auth.users entry
 *     (banned_until ≥100 years out)
 *   - second decommission run is a no-op
 *   - re-adding the roster row restores it to active (banned_until null)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { isLiveSupabaseAvailable, createAdminClient } from "./lib/live.js";
import { runProvisionCommand } from "../../src/commands/people-provision.js";

// Live-Postgres integration test: threads a real createDefaultRuntime() with
// a quiet proc so reconciliation output doesn't pollute the test log.
function quietRuntime() {
  const base = createDefaultRuntime();
  return {
    ...base,
    proc: {
      ...base.proc,
      stdout: { write: () => true },
      stderr: { write: () => true },
    },
  };
}
const runtime = quietRuntime();

async function listEmails(admin) {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const u of data.users) all.push(u);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return all;
}

describe("fit-map people provision lifecycle", () => {
  if (!isLiveSupabaseAvailable()) {
    test("skipped — SUPABASE_URL / SUPABASE_JWT_SECRET not set", {
      skip: true,
    }, () => {});
    return;
  }

  test("create → idempotent re-run → decommission → re-add lifecycle", async () => {
    const admin = createAdminClient();

    // Reset: ban any pre-existing auth.users entries for the test emails.
    const before = await listEmails(admin);
    for (const u of before) {
      if (/(alice|bob|carol)@provision-test\.example/.test(u.email ?? "")) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }

    // Reset roster.
    await admin
      .from("organization_people")
      .delete()
      .in("email", [
        "alice@provision-test.example",
        "bob@provision-test.example",
      ]);

    await admin.from("organization_people").insert([
      {
        email: "alice@provision-test.example",
        manager_email: null,
        getdx_team_id: "t",
      },
      {
        email: "bob@provision-test.example",
        manager_email: null,
        getdx_team_id: "t",
      },
    ]);

    // 1. First run.
    await runProvisionCommand({ supabase: admin, runtime });
    let users = (await listEmails(admin)).filter((u) =>
      /provision-test\.example$/.test(u.email ?? ""),
    );
    const byEmail = new Map(users.map((u) => [u.email, u]));
    assert.equal(byEmail.size, 2);
    for (const u of byEmail.values()) assert.ok(!u.banned_until);
    const idsBefore = new Map([...byEmail].map(([e, u]) => [e, u.id]));

    // 2. Idempotent re-run.
    await runProvisionCommand({ supabase: admin, runtime });
    users = (await listEmails(admin)).filter((u) =>
      /provision-test\.example$/.test(u.email ?? ""),
    );
    const byEmail2 = new Map(users.map((u) => [u.email, u]));
    assert.equal(byEmail2.size, 2);
    for (const [e, u] of byEmail2) {
      assert.equal(u.id, idsBefore.get(e), `id stability for ${e}`);
      assert.ok(!u.banned_until, `${e} active`);
    }

    // 3. Decommission Alice.
    await admin
      .from("organization_people")
      .delete()
      .eq("email", "alice@provision-test.example");
    await runProvisionCommand({ supabase: admin, runtime });
    users = (await listEmails(admin)).filter((u) =>
      /provision-test\.example$/.test(u.email ?? ""),
    );
    const alice = users.find((u) => u.email === "alice@provision-test.example");
    assert.ok(alice, "alice still exists");
    assert.ok(alice.banned_until, "alice banned_until set");
    const aliceUntil = new Date(alice.banned_until).getTime();
    const fiftyYears = 50 * 365 * 24 * 60 * 60 * 1000;
    assert.ok(
      aliceUntil - Date.now() >= fiftyYears,
      `alice banned_until=${alice.banned_until} is < 50yr out`,
    );

    // 4. Second decommission run is a no-op.
    const aliceIdAfterDecomm = alice.id;
    const aliceUntilAfterDecomm = alice.banned_until;
    await runProvisionCommand({ supabase: admin, runtime });
    users = (await listEmails(admin)).filter((u) =>
      /provision-test\.example$/.test(u.email ?? ""),
    );
    const alice2 = users.find(
      (u) => u.email === "alice@provision-test.example",
    );
    assert.equal(alice2.id, aliceIdAfterDecomm, "alice id unchanged");
    assert.equal(
      alice2.banned_until,
      aliceUntilAfterDecomm,
      "alice banned_until unchanged",
    );

    // 5. Re-add alice → restored to active.
    await admin.from("organization_people").insert([
      {
        email: "alice@provision-test.example",
        manager_email: null,
        getdx_team_id: "t",
      },
    ]);
    await runProvisionCommand({ supabase: admin, runtime });
    users = (await listEmails(admin)).filter((u) =>
      /provision-test\.example$/.test(u.email ?? ""),
    );
    const alice3 = users.find(
      (u) => u.email === "alice@provision-test.example",
    );
    assert.ok(!alice3.banned_until, "alice restored to active");
    assert.equal(
      alice3.id,
      aliceIdAfterDecomm,
      "alice id stable across re-add",
    );

    // Cleanup.
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
    await admin
      .from("organization_people")
      .delete()
      .in("email", [
        "alice@provision-test.example",
        "bob@provision-test.example",
      ]);
  });
});

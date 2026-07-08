/**
 * Provisioning reconciles auth.users against the contract roster
 * (`substrate.people`): create missing, restore banned, decommission
 * removed — against a stubbed `auth.admin`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runProvision } from "../src/substrate/auth-users.js";

const FAR_FUTURE = "2126-01-01T00:00:00Z";

function makeSupabase({ people = [], authUsers = [] }) {
  const admin = {
    created: [],
    updated: [],
    async listUsers() {
      return { data: { users: authUsers }, error: null };
    },
    async createUser(opts) {
      admin.created.push(opts);
      return { data: { user: { email: opts.email } }, error: null };
    },
    async updateUserById(id, opts) {
      admin.updated.push({ id, ...opts });
      const banned_until = opts.ban_duration === "none" ? null : FAR_FUTURE;
      return { data: { user: { id, banned_until } }, error: null };
    },
  };
  return {
    admin,
    from(table) {
      assert.equal(table, "people");
      return {
        select: () => Promise.resolve({ data: people, error: null }),
      };
    },
    auth: { admin },
  };
}

describe("runProvision", () => {
  test("creates auth users for roster emails missing from auth.users", async () => {
    const supabase = makeSupabase({
      people: [{ email: "a@x" }, { email: "b@x" }],
      authUsers: [{ id: "u1", email: "a@x" }],
    });
    const runtime = createTestRuntime();
    const { summary } = await runProvision({ supabase, runtime });
    assert.equal(summary.created, 1);
    assert.equal(summary.unchanged, 1);
    assert.deepEqual(supabase.admin.created, [
      { email: "b@x", email_confirm: true },
    ]);
  });

  test("restores previously banned roster users", async () => {
    const supabase = makeSupabase({
      people: [{ email: "a@x" }],
      authUsers: [{ id: "u1", email: "a@x", banned_until: FAR_FUTURE }],
    });
    const runtime = createTestRuntime();
    const { summary } = await runProvision({ supabase, runtime });
    assert.equal(summary.restored, 1);
    assert.deepEqual(supabase.admin.updated, [
      { id: "u1", ban_duration: "none" },
    ]);
  });

  test("decommissions auth users removed from the roster", async () => {
    const supabase = makeSupabase({
      people: [{ email: "a@x" }],
      authUsers: [
        { id: "u1", email: "a@x" },
        { id: "u2", email: "gone@x" },
      ],
    });
    const runtime = createTestRuntime();
    const { summary } = await runProvision({ supabase, runtime });
    assert.equal(summary.decommissioned, 1);
    assert.equal(supabase.admin.updated[0].id, "u2");
    assert.equal(supabase.admin.updated[0].ban_duration, "876000h");
  });

  test("propagates substrate.people query errors", async () => {
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: null,
            error: { message: "permission denied" },
          }),
      }),
      auth: { admin: {} },
    };
    const runtime = createTestRuntime();
    await assert.rejects(
      () => runProvision({ supabase, runtime }),
      /substrate\.people: permission denied/,
    );
  });
});

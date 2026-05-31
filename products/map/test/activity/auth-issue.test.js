/**
 * Unit tests for `fit-map auth issue` — uses an in-memory Supabase mock so
 * the verb's branching (missing roster row, missing auth.users row, happy
 * path, --ttl propagation) is covered without a live stack.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runAuthIssueCommand } from "../../src/commands/auth-issue.js";

/** Build a Supabase-shaped stub with the two surfaces auth-issue calls. */
function makeStub({ rosterRow, authUsers = [] }) {
  return {
    from(table) {
      if (table !== "organization_people")
        throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: rosterRow ?? null, error: null };
        },
      };
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: authUsers }, error: null };
        },
      },
    },
  };
}

function makeConfig(secret = "test-secret") {
  return {
    supabaseJwtSecret: () => {
      if (secret === null) {
        throw new Error("SUPABASE_JWT_SECRET not found in environment");
      }
      return secret;
    },
  };
}

describe("runAuthIssueCommand", () => {
  let runtime;
  let config;

  beforeEach(() => {
    config = makeConfig("test-secret");
    runtime = createTestRuntime();
  });

  test("happy path mints a JWT for a human row", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    const result = await runAuthIssueCommand({
      supabase,
      config,
      options: { email: "alice@example.com" },
      runtime,
    });
    assert.equal(result.meta.ok, true);
    assert.equal(result.summary.email, "alice@example.com");
    assert.equal(result.summary.kind, "human");
    // 8760h = 365 * 24 * 3600 = 31_536_000 seconds.
    assert.equal(result.summary.ttlSeconds, 31_536_000);

    const printed = runtime.proc.stdout.chunks.join("");
    // The JWT is the first multi-segment dot string of length ≥3.
    const jwtMatch = printed.match(/[\w-]+\.[\w-]+\.[\w-]+/);
    assert.ok(jwtMatch, "JWT not present in stdout");
    const parts = jwtMatch[0].split(".");
    assert.equal(parts.length, 3);
  });

  test("mints a JWT for a service_account row", async () => {
    const supabase = makeStub({
      rosterRow: { email: "agent@example.com", kind: "service_account" },
      authUsers: [{ id: "u2", email: "agent@example.com" }],
    });
    const result = await runAuthIssueCommand({
      supabase,
      config,
      options: { email: "agent@example.com" },
      runtime,
    });
    assert.equal(result.summary.kind, "service_account");
  });

  test("--ttl propagates", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    const result = await runAuthIssueCommand({
      supabase,
      config,
      options: { email: "alice@example.com", ttl: "30d" },
      runtime,
    });
    assert.equal(result.summary.ttlSeconds, 30 * 86_400);
  });

  test("rejects missing --email", async () => {
    const supabase = makeStub({});
    await assert.rejects(
      () => runAuthIssueCommand({ supabase, config, options: {}, runtime }),
      /--email <e> is required/,
    );
  });

  test("rejects missing JWT secret", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    await assert.rejects(
      () =>
        runAuthIssueCommand({
          supabase,
          config: makeConfig(null),
          options: { email: "alice@example.com" },
          runtime,
        }),
      /SUPABASE_JWT_SECRET is not set/,
    );
  });

  test("missing organization_people row points at `people push`", async () => {
    const supabase = makeStub({
      rosterRow: null,
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    await assert.rejects(
      () =>
        runAuthIssueCommand({
          supabase,
          config,
          options: { email: "alice@example.com" },
          runtime,
        }),
      /no organization_people row[\s\S]*fit-map people push/,
    );
  });

  test("missing auth.users row points at `people provision`", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [],
    });
    await assert.rejects(
      () =>
        runAuthIssueCommand({
          supabase,
          config,
          options: { email: "alice@example.com" },
          runtime,
        }),
      /no auth\.users row[\s\S]*fit-map people provision/,
    );
  });

  test("rejects bad --ttl format", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    await assert.rejects(
      () =>
        runAuthIssueCommand({
          supabase,
          config,
          options: { email: "alice@example.com", ttl: "5m" },
          runtime,
        }),
      /invalid duration/,
    );
  });
});

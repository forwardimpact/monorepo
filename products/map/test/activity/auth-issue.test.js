/**
 * Unit tests for `fit-map auth issue` — uses an in-memory Supabase mock so
 * the verb's branching (missing roster row, missing auth.users row, happy
 * path, --ttl propagation) is covered without a live stack.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

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

function captureStdout() {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return true;
  };
  return {
    text: () => chunks.join(""),
    restore: () => {
      process.stdout.write = orig;
    },
  };
}

describe("runAuthIssueCommand", () => {
  const savedSecret = process.env.MAP_SUPABASE_JWT_SECRET;
  let out;

  beforeEach(() => {
    process.env.MAP_SUPABASE_JWT_SECRET = "test-secret";
    out = captureStdout();
  });
  afterEach(() => {
    out.restore();
    if (savedSecret === undefined) delete process.env.MAP_SUPABASE_JWT_SECRET;
    else process.env.MAP_SUPABASE_JWT_SECRET = savedSecret;
  });

  test("happy path mints a JWT for a human row", async () => {
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    const result = await runAuthIssueCommand({
      supabase,
      options: { email: "alice@example.com" },
    });
    assert.equal(result.meta.ok, true);
    assert.equal(result.summary.email, "alice@example.com");
    assert.equal(result.summary.kind, "human");
    // 8760h = 365 * 24 * 3600 = 31_536_000 seconds.
    assert.equal(result.summary.ttlSeconds, 31_536_000);

    const printed = out.text();
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
      options: { email: "agent@example.com" },
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
      options: { email: "alice@example.com", ttl: "30d" },
    });
    assert.equal(result.summary.ttlSeconds, 30 * 86_400);
  });

  test("rejects missing --email", async () => {
    const supabase = makeStub({});
    await assert.rejects(
      () => runAuthIssueCommand({ supabase, options: {} }),
      /--email <e> is required/,
    );
  });

  test("rejects missing JWT secret", async () => {
    delete process.env.MAP_SUPABASE_JWT_SECRET;
    const supabase = makeStub({
      rosterRow: { email: "alice@example.com", kind: "human" },
      authUsers: [{ id: "u1", email: "alice@example.com" }],
    });
    await assert.rejects(
      () =>
        runAuthIssueCommand({
          supabase,
          options: { email: "alice@example.com" },
        }),
      /MAP_SUPABASE_JWT_SECRET is not set/,
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
          options: { email: "alice@example.com" },
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
          options: { email: "alice@example.com" },
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
          options: { email: "alice@example.com", ttl: "5m" },
        }),
      /invalid duration/,
    );
  });
});

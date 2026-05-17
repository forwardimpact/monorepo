/**
 * Tests for `fit-map substrate issue` — covers atomic write, mode 0600
 * on each file, the kind=human gate, and the optional --stash path.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { runSubstrateIssueCommand } from "../../src/commands/substrate-issue.js";

function makeSupabase({
  personRow,
  authUsers = [{ email: "alice@x" }],
  snapshots = [{ snapshot_id: "S1" }],
  scores = [{ item_id: "ITEM1", snapshot_id: "S1" }],
}) {
  return {
    from(table) {
      let rows;
      let filter = (rs) => rs;
      switch (table) {
        case "organization_people":
          rows = personRow ? [personRow] : [];
          break;
        case "getdx_snapshots":
          rows = snapshots;
          break;
        case "getdx_snapshot_team_scores":
          rows = scores;
          break;
        default:
          throw new Error(`unexpected table ${table}`);
      }
      let filtered = rows;
      const builder = {
        select() {
          filtered = filter(rows);
          return builder;
        },
        eq(col, val) {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: filtered, error: null });
        },
        async maybeSingle() {
          return { data: filtered[0] ?? null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: filtered, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
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

const config = {
  supabaseJwtSecret: () =>
    "long-enough-test-secret-for-hs256-min-32-bytes-aaaa",
};

describe("substrate issue", () => {
  let tmpdir;
  let stdoutWrite;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "substrate-issue-"));
    stdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
  });

  afterEach(async () => {
    process.stdout.write = stdoutWrite;
    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  test("writes .env (PRODUCT_LANDMARK_TOKEN) and .substrate.json with mode 0600", async () => {
    const supabase = makeSupabase({
      personRow: {
        email: "alice@x",
        kind: "human",
        manager_email: null,
      },
    });
    const code = await runSubstrateIssueCommand({
      supabase,
      config,
      options: { email: "alice@x", cwd: tmpdir },
    });
    assert.equal(code, 0);

    const envContent = await fs.readFile(path.join(tmpdir, ".env"), "utf8");
    assert.match(envContent, /^PRODUCT_LANDMARK_TOKEN=[^\s]+\n$/);

    const envStat = await fs.stat(path.join(tmpdir, ".env"));
    assert.equal(envStat.mode & 0o777, 0o600);

    const subRaw = await fs.readFile(
      path.join(tmpdir, ".substrate.json"),
      "utf8",
    );
    const parsed = JSON.parse(subRaw);
    assert.equal(parsed.persona_email, "alice@x");
    assert.equal(parsed.manager_email, "alice@x");
    assert.equal(parsed.snapshot_id, "S1");
    assert.equal(parsed.item_id, "ITEM1");

    const subStat = await fs.stat(path.join(tmpdir, ".substrate.json"));
    assert.equal(subStat.mode & 0o777, 0o600);
  });

  test("rejects kind=service_account with named alternative", async () => {
    const supabase = makeSupabase({
      personRow: {
        email: "svc@x",
        kind: "service_account",
        manager_email: null,
      },
    });
    await assert.rejects(
      () =>
        runSubstrateIssueCommand({
          supabase,
          config,
          options: { email: "svc@x", cwd: tmpdir },
        }),
      /kind=service_account, not human.*fit-map auth issue/s,
    );
  });

  test("--stash writes a third file containing just the JWT (mode 0600)", async () => {
    const stashPath = path.join(tmpdir, "stash.jwt");
    const supabase = makeSupabase({
      personRow: {
        email: "alice@x",
        kind: "human",
        manager_email: null,
      },
    });
    const code = await runSubstrateIssueCommand({
      supabase,
      config,
      options: { email: "alice@x", cwd: tmpdir, stash: stashPath },
    });
    assert.equal(code, 0);

    const stashContent = await fs.readFile(stashPath, "utf8");
    assert.match(
      stashContent,
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/,
    );

    const stashStat = await fs.stat(stashPath);
    assert.equal(stashStat.mode & 0o777, 0o600);
  });

  test("missing --email throws", async () => {
    const supabase = makeSupabase({ personRow: null });
    await assert.rejects(
      () =>
        runSubstrateIssueCommand({
          supabase,
          config,
          options: { cwd: tmpdir },
        }),
      /--email <e> is required/,
    );
  });

  test("missing --cwd throws", async () => {
    const supabase = makeSupabase({ personRow: null });
    await assert.rejects(
      () =>
        runSubstrateIssueCommand({
          supabase,
          config,
          options: { email: "alice@x" },
        }),
      /--cwd <path> is required/,
    );
  });

  test("rejects when no organization_people row exists", async () => {
    const supabase = makeSupabase({ personRow: null });
    await assert.rejects(
      () =>
        runSubstrateIssueCommand({
          supabase,
          config,
          options: { email: "ghost@x", cwd: tmpdir },
        }),
      /no organization_people row/,
    );
  });

  test("rejects when no auth.users row exists", async () => {
    const supabase = makeSupabase({
      personRow: {
        email: "alice@x",
        kind: "human",
        manager_email: null,
      },
      authUsers: [],
    });
    await assert.rejects(
      () =>
        runSubstrateIssueCommand({
          supabase,
          config,
          options: { email: "alice@x", cwd: tmpdir },
        }),
      /no auth.users row/,
    );
  });
});

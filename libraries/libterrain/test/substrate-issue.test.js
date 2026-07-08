/**
 * `substrate issue` — file set, `--token-env` threading and required-ness,
 * stash, non-human rejection, and identity-only degradation when
 * `substrate.discovery` is absent. Atomic write + chmod 0600 run on real
 * disk, so these tests thread a real runtime with a quiet proc.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runSubstrateIssue } from "../src/commands/substrate-issue.js";
import {
  makeSubstrateStub,
  invariantSatisfyingSeed,
} from "./substrate-stubs.js";

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

function seededStub(overrides = {}) {
  const seed = {
    ...invariantSatisfyingSeed(),
    authUsers: [{ email: "mgr@x" }],
  };
  return makeSubstrateStub({ ...seed, ...overrides });
}

const config = {
  supabaseJwtSecret: () =>
    "long-enough-test-secret-for-hs256-min-32-bytes-aaaa",
};

describe("substrate issue", () => {
  let tmpdir;
  let runtime;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "substrate-issue-"));
    runtime = quietRuntime();
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  test("writes .env with the caller-supplied token name and .substrate.json with discovery spread, mode 0600", async () => {
    const code = await runSubstrateIssue({
      supabase: seededStub(),
      config,
      options: { email: "mgr@x", cwd: tmpdir, tokenEnv: "MY_APP_TOKEN" },
      runtime,
    });
    assert.equal(code, 0);

    const envContent = await fs.readFile(path.join(tmpdir, ".env"), "utf8");
    assert.match(envContent, /^MY_APP_TOKEN=[^\s]+\n$/);

    const envStat = await fs.stat(path.join(tmpdir, ".env"));
    assert.equal(envStat.mode & 0o777, 0o600);

    const parsed = JSON.parse(
      await fs.readFile(path.join(tmpdir, ".substrate.json"), "utf8"),
    );
    assert.equal(parsed.persona_email, "mgr@x");
    assert.equal(parsed.manager_email, "mgr@x");
    // Discovery key/values spread at top level, not nested.
    assert.equal(parsed.snapshot_id, "S1");
    assert.equal(parsed.item_id, "ITEM1");
    assert.equal("discovery" in parsed, false);
    assert.ok(parsed.generated_at);

    const subStat = await fs.stat(path.join(tmpdir, ".substrate.json"));
    assert.equal(subStat.mode & 0o777, 0o600);
  });

  test("--token-env is required with no default", async () => {
    await assert.rejects(
      () =>
        runSubstrateIssue({
          supabase: seededStub(),
          config,
          options: { email: "mgr@x", cwd: tmpdir },
          runtime,
        }),
      /--token-env <NAME> is required/,
    );
    // Nothing landed.
    const entries = await fs.readdir(tmpdir);
    assert.deepEqual(entries, []);
  });

  test("discovery rows cannot overwrite the reserved identity fields", async () => {
    const code = await runSubstrateIssue({
      supabase: seededStub({
        discovery: [
          { key: "persona_email", value: "evil@x" },
          { key: "manager_email", value: "evil@x" },
          { key: "generated_at", value: "1970-01-01" },
          { key: "snapshot_id", value: "S1" },
        ],
      }),
      config,
      options: { email: "mgr@x", cwd: tmpdir, tokenEnv: "T" },
      runtime,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(
      await fs.readFile(path.join(tmpdir, ".substrate.json"), "utf8"),
    );
    assert.equal(parsed.persona_email, "mgr@x");
    assert.equal(parsed.manager_email, "mgr@x");
    assert.notEqual(parsed.generated_at, "1970-01-01");
    assert.equal(parsed.snapshot_id, "S1");
  });

  test("absent substrate.discovery writes an identity-only .substrate.json", async () => {
    const code = await runSubstrateIssue({
      supabase: seededStub({ discovery: null }),
      config,
      options: { email: "mgr@x", cwd: tmpdir, tokenEnv: "T" },
      runtime,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(
      await fs.readFile(path.join(tmpdir, ".substrate.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(parsed).sort(), [
      "generated_at",
      "manager_email",
      "persona_email",
    ]);
  });

  test("--stash writes a third file containing just the JWT (mode 0600)", async () => {
    const stashPath = path.join(tmpdir, "stash.jwt");
    const code = await runSubstrateIssue({
      supabase: seededStub(),
      config,
      options: {
        email: "mgr@x",
        cwd: tmpdir,
        tokenEnv: "T",
        stash: stashPath,
      },
      runtime,
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

  test("rejects kind!=human naming substrate.people, not a product CLI", async () => {
    await assert.rejects(
      () =>
        runSubstrateIssue({
          supabase: seededStub(),
          config,
          options: { email: "svc@x", cwd: tmpdir, tokenEnv: "T" },
          runtime,
        }),
      (err) => {
        assert.match(err.message, /kind=service_account, not human/);
        assert.match(err.message, /substrate\.people/);
        assert.doesNotMatch(err.message, /fit-map/);
        return true;
      },
    );
  });

  test("rejects when no substrate.people row exists", async () => {
    await assert.rejects(
      () =>
        runSubstrateIssue({
          supabase: seededStub(),
          config,
          options: { email: "ghost@x", cwd: tmpdir, tokenEnv: "T" },
          runtime,
        }),
      /no substrate\.people row/,
    );
  });

  test("rejects when no auth.users row exists", async () => {
    await assert.rejects(
      () =>
        runSubstrateIssue({
          supabase: seededStub({ authUsers: [] }),
          config,
          options: { email: "mgr@x", cwd: tmpdir, tokenEnv: "T" },
          runtime,
        }),
      /no auth.users row/,
    );
  });

  test("rename failure leaves no orphan tmp files", async () => {
    // Make `.env` an existing non-empty directory so the rename fails.
    await fs.mkdir(path.join(tmpdir, ".env"));
    await fs.writeFile(path.join(tmpdir, ".env", "marker"), "blocker");

    await assert.rejects(() =>
      runSubstrateIssue({
        supabase: seededStub(),
        config,
        options: { email: "mgr@x", cwd: tmpdir, tokenEnv: "T" },
        runtime,
      }),
    );

    const entries = await fs.readdir(tmpdir);
    assert.equal(
      entries.filter((e) => e.includes(".tmp-")).length,
      0,
      `expected no orphan tmp files, got ${entries.join(", ")}`,
    );
    assert.equal(entries.includes(".substrate.json"), false);
  });
});

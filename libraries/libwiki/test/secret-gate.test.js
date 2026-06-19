import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockGitClient } from "@forwardimpact/libmock";

import {
  scanPushWindow,
  appendOverrideRecord,
  OVERRIDE_LOG,
} from "../src/secret-gate.js";

const WIKI = "/repo/wiki";
const RANGE = "origin/master..HEAD";

/**
 * A subprocess stub that distinguishes the two `gitleaks` invocations the gate
 * makes — `version` (probe) and `detect` (scan) — by their first arg, since
 * the libmock subprocess keys responses by command name only. Records calls.
 */
function gitleaksSubprocess({ version = { exitCode: 0 }, detect = {} } = {}) {
  const calls = [];
  return {
    calls,
    run: async (cmd, args = [], opts = {}) => {
      calls.push({ cmd, args, opts });
      const shape = args[0] === "version" ? version : detect;
      return { stdout: "", stderr: "", exitCode: 0, signal: null, ...shape };
    },
    runSync: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    spawn: () => ({}),
  };
}

// The secret value is assembled from parts so no `ghp_`-prefixed literal sits
// in source (GitHub push-protection rejects token literals). The test still
// proves the value is never copied into a finding.
const FAKE_SECRET = ["ghp", "THISMUSTNEVERAPPEARINAFINDING"].join("_");
const FINDING_REPORT = JSON.stringify([
  {
    RuleID: "github-pat",
    StartLine: 7,
    File: "MEMORY.md",
    Secret: FAKE_SECRET,
    Match: FAKE_SECRET,
  },
]);

describe("scanPushWindow", () => {
  test("clean range (gitleaks exit 0) reports clean", async () => {
    const subprocess = gitleaksSubprocess({ detect: { exitCode: 0 } });
    const runtime = createTestRuntime({ subprocess });
    const result = await scanPushWindow({
      runtime,
      wikiDir: WIKI,
      range: RANGE,
    });
    assert.deepEqual(result, { status: "clean" });
    // version probe then detect, both against the wiki dir
    assert.equal(subprocess.calls.length, 2);
    assert.deepEqual(subprocess.calls[0].args, ["version"]);
    assert.deepEqual(subprocess.calls[1].args, [
      "detect",
      "--source",
      WIKI,
      "--log-opts",
      RANGE,
      "--report-format",
      "json",
      "--report-path",
      "-",
    ]);
  });

  test("leaks found (gitleaks exit 1) reports a finding with location only", async () => {
    const subprocess = gitleaksSubprocess({
      detect: { exitCode: 1, stdout: FINDING_REPORT },
    });
    const runtime = createTestRuntime({ subprocess });
    const result = await scanPushWindow({
      runtime,
      wikiDir: WIKI,
      range: RANGE,
    });
    assert.equal(result.status, "finding");
    assert.deepEqual(result.findings, [
      { file: "MEMORY.md", line: 7, rule: "github-pat" },
    ]);
    // The secret value must never ride along in a finding.
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /ghp_/);
    assert.ok(!("Secret" in result.findings[0]));
  });

  test("invocation error (gitleaks exit 2) fails closed to scanner-absent", async () => {
    const subprocess = gitleaksSubprocess({ detect: { exitCode: 2 } });
    const runtime = createTestRuntime({ subprocess });
    const result = await scanPushWindow({
      runtime,
      wikiDir: WIKI,
      range: RANGE,
    });
    assert.deepEqual(result, { status: "scanner-absent" });
  });

  test("missing binary (version probe non-zero) reports scanner-absent and never scans", async () => {
    const subprocess = gitleaksSubprocess({ version: { exitCode: 127 } });
    const runtime = createTestRuntime({ subprocess });
    const result = await scanPushWindow({
      runtime,
      wikiDir: WIKI,
      range: RANGE,
    });
    assert.deepEqual(result, { status: "scanner-absent" });
    // Only the probe runs; no detect call when the scanner is absent.
    assert.equal(subprocess.calls.length, 1);
    assert.deepEqual(subprocess.calls[0].args, ["version"]);
  });

  test("malformed report yields an empty finding list (still a finding verdict)", async () => {
    const subprocess = gitleaksSubprocess({
      detect: { exitCode: 1, stdout: "not json" },
    });
    const runtime = createTestRuntime({ subprocess });
    const result = await scanPushWindow({
      runtime,
      wikiDir: WIKI,
      range: RANGE,
    });
    assert.deepEqual(result, { status: "finding", findings: [] });
  });
});

describe("appendOverrideRecord", () => {
  test("finding override writes a secret-free, located line and stages the log", async () => {
    const appended = [];
    const runtime = createTestRuntime({
      fs: { appendFile: async (p, data) => appended.push({ p, data }) },
      clock: { now: () => Date.parse("2026-06-18T12:00:00Z") },
    });
    const gitClient = createMockGitClient({
      responses: { configGet: "agent@example.com" },
    });
    const result = await appendOverrideRecord({
      runtime,
      gitClient,
      wikiDir: WIKI,
      klass: "finding",
      reason: "confirmed false positive\nfrom review",
      findings: [{ file: "MEMORY.md", line: 7, rule: "github-pat" }],
    });
    assert.deepEqual(result, { path: OVERRIDE_LOG });
    assert.equal(appended.length, 1);
    assert.equal(appended[0].p, `${WIKI}/${OVERRIDE_LOG}`);
    const line = appended[0].data;
    assert.match(line, /^2026-06-18T12:00:00\.000Z\t/);
    assert.match(line, /\tagent@example\.com\t/);
    assert.match(line, /\tfinding\t/);
    // The reason is collapsed to a single line.
    assert.match(line, /\tconfirmed false positive from review\t/);
    assert.match(line, /\tMEMORY\.md:7:github-pat\n$/);
    // The audit line itself must never carry a secret value.
    assert.doesNotMatch(line, /ghp_/);
    // The log is committed path-scoped into the same push.
    const commit = gitClient.calls.find((c) => c.method === "commitPaths");
    assert.deepEqual(commit.args, [
      `wiki: secret-gate override (finding)`,
      [OVERRIDE_LOG],
      { cwd: WIKI },
    ]);
  });

  test("scanner-absent override writes a scanner-absent location", async () => {
    const appended = [];
    const runtime = createTestRuntime({
      fs: { appendFile: async (p, data) => appended.push({ p, data }) },
      clock: { now: () => Date.parse("2026-06-18T12:00:00Z") },
    });
    const gitClient = createMockGitClient({
      responses: { configGet: "agent@example.com" },
    });
    await appendOverrideRecord({
      runtime,
      gitClient,
      wikiDir: WIKI,
      klass: "scanner-absent",
      reason: "gitleaks unavailable on this runner",
    });
    assert.match(
      appended[0].data,
      /\tscanner-absent\tgitleaks unavailable on this runner\tscanner-absent\n$/,
    );
  });
});

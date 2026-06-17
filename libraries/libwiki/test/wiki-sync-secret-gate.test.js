import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import {
  WIKI,
  HEALTHY_PUSH,
  make,
  gateSubprocess,
} from "./wiki-sync-harness.js";

// A mock fsSync whose wiki already carries the metrics-CSV union declaration,
// so `commitAndPush`'s ensure-before-gate is a no-op and the git call sequence
// is byte-identical to a commit-and-push that ensures nothing. Provisioning
// behavior (the ensure writing the file) is covered in
// wiki-sync.integration.test.js against real git.
const provisionedFs = () =>
  createMockFs({
    [`${WIKI}/.gitattributes`]: "metrics/**/*.csv merge=union\n",
  });

describe("WikiSync secret gate", () => {
  test("commitAndPush refuses with secret-detected and never pushes on a finding", async () => {
    const report = JSON.stringify([
      { RuleID: "github-pat", StartLine: 7, File: "MEMORY.md" },
    ]);
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
      subprocess: gateSubprocess({ detect: 1, report }),
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "secret-detected",
      findings: [{ file: "MEMORY.md", line: 7, rule: "github-pat" }],
    });
    assert.ok(!methods().includes("pushPorcelain"), "no push attempted on a finding");
  });

  test("commitAndPush refuses with scanner-unavailable and never pushes when the scanner is absent", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
      subprocess: gateSubprocess({ version: 127 }),
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: false, reason: "scanner-unavailable" });
    assert.ok(
      !methods().includes("pushPorcelain"),
      "no push attempted when scanner absent",
    );
  });

  test("commitAndPush pushes when the scan is clean", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
      subprocess: gateSubprocess({ detect: 0 }),
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
    assert.ok(methods().includes("pushPorcelain"), "clean scan proceeds to push");
  });

  test("FIT_WIKI_SECRET_OVERRIDE permits a finding, records it, then pushes", async () => {
    const report = JSON.stringify([
      { RuleID: "github-pat", StartLine: 7, File: "MEMORY.md" },
    ]);
    const { wikiSync, methods, git } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
        configGet: "agent@example.com",
      },
      subprocess: gateSubprocess({ detect: 1, report }),
      env: { FIT_WIKI_SECRET_OVERRIDE: "confirmed false positive" },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
    assert.ok(methods().includes("pushPorcelain"), "override proceeds to push");
    // The audit log is committed path-scoped into the same push.
    const overrideCommit = git.calls.find(
      (c) =>
        c.method === "commitPaths" &&
        c.args[1]?.includes("secret-overrides.log"),
    );
    assert.ok(overrideCommit, "override commits the audit log");
  });

  test("FIT_WIKI_SCANNER_ABSENT_OK permits a scanner absence and pushes", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
        configGet: "agent@example.com",
      },
      subprocess: gateSubprocess({ version: 127 }),
      env: { FIT_WIKI_SCANNER_ABSENT_OK: "gitleaks unavailable here" },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
    assert.ok(methods().includes("pushPorcelain"), "absence override proceeds to push");
  });
});

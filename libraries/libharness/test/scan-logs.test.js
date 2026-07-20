/**
 * Unit tests for `gemba-harness scan-logs`.
 *
 * `scanDirectory` and `parseSecrets` are pure and tested directly against a
 * libmock fs; `runScanLogsCommand` is tested for the fail-closed path when the
 * archive cannot be extracted (unzip exits non-zero) — a fail-open there would
 * silently disarm the leak gate.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockFs,
  createMockProcess,
} from "@forwardimpact/libmock";

import {
  scanDirectory,
  parseSecrets,
  runScanLogsCommand,
} from "../src/commands/scan-logs.js";

describe("parseSecrets", () => {
  test("splits on the first = only (literals may contain =)", () => {
    const parsed = parseSecrets([
      "persona-jwt=eyJ.header=.sig==",
      "empty=",
      "bare",
    ]);
    assert.deepEqual(parsed, [
      { label: "persona-jwt", literal: "eyJ.header=.sig==" },
      { label: "empty", literal: "" },
      { label: "bare", literal: "" },
    ]);
  });

  test("tolerates a bare string or undefined", () => {
    assert.deepEqual(parseSecrets("a=b"), [{ label: "a", literal: "b" }]);
    assert.deepEqual(parseSecrets(undefined), []);
  });
});

describe("scanDirectory", () => {
  function runtimeWithLogs(files) {
    const fs = createMockFs();
    for (const [path, content] of Object.entries(files)) {
      // Register the file by writing it; nested dirs are inferred by readdir.
      fs.writeFileSync(path, content);
    }
    return createTestRuntime({ fs });
  }

  test("hit: records the label whose literal appears in a nested file", async () => {
    const runtime = runtimeWithLogs({
      "/logs/build/1_step.txt": "starting build\nTOKEN=super-secret-jwt done",
      "/logs/build/2_step.txt": "nothing here",
    });
    const failures = await scanDirectory({
      dir: "/logs",
      secrets: [
        { label: "persona-jwt", literal: "super-secret-jwt" },
        { label: "other", literal: "not-present" },
      ],
      runtime,
    });
    assert.deepEqual(failures, ["persona-jwt"]);
  });

  test("clean: no literal present → empty", async () => {
    const runtime = runtimeWithLogs({
      "/logs/a.txt": "all masked ***",
    });
    const failures = await scanDirectory({
      dir: "/logs",
      secrets: [{ label: "jwt-secret", literal: "abc123" }],
      runtime,
    });
    assert.deepEqual(failures, []);
  });

  test("empty literals are skipped (a never-set secret cannot leak)", async () => {
    const runtime = runtimeWithLogs({ "/logs/a.txt": "" });
    const failures = await scanDirectory({
      dir: "/logs",
      secrets: [{ label: "persona-jwt", literal: "" }],
      runtime,
    });
    assert.deepEqual(failures, []);
  });
});

describe("runScanLogsCommand", () => {
  // Build a runtime whose `unzip` "extracts" the given fixture files into the
  // `-d <dir>` target in the mock fs, so the whole command (resolve → extract
  // → scan → exit code) runs end-to-end without a real archive or binary.
  function runtimeExtracting(files) {
    const fs = createMockFs();
    const proc = createMockProcess();
    const subprocess = {
      run: async (cmd, args = []) => {
        if (cmd === "unzip") {
          const dir = args[args.indexOf("-d") + 1];
          for (const [name, content] of Object.entries(files)) {
            fs.writeFileSync(`${dir}/${name}`, content);
          }
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      spawn: () => ({ exitCode: Promise.resolve(0) }),
    };
    return createTestRuntime({ fs, proc, subprocess });
  }

  test("hit: a resolved archive containing a literal exits non-zero", async () => {
    const runtime = runtimeExtracting({
      "1_build.txt": "starting\nAuthorization: Bearer super-secret-jwt\ndone",
    });
    const result = await runScanLogsCommand({
      deps: { runtime },
      options: {
        archive: "/tmp/run-logs.zip",
        secret: ["persona-jwt=super-secret-jwt", "unused=not-present"],
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
  });

  test("clean: a resolved archive with no literal exits zero", async () => {
    const runtime = runtimeExtracting({
      "1_build.txt": "all values masked as ***\n",
    });
    const result = await runScanLogsCommand({
      deps: { runtime },
      options: {
        archive: "/tmp/run-logs.zip",
        secret: ["persona-jwt=super-secret-jwt"],
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 0);
  });

  test("fails closed when the archive cannot be extracted", async () => {
    const runtime = createTestRuntime({
      subprocess: {
        // unzip a nonexistent archive → non-zero exit.
        run: async () => ({ exitCode: 9, stdout: "", stderr: "cannot find" }),
        spawn: () => ({ exitCode: Promise.resolve(0) }),
      },
    });
    const result = await runScanLogsCommand({
      deps: { runtime },
      options: { archive: "/nope/missing.zip", secret: ["a=b"] },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.error, /unreadable|unzip/);
  });

  test("requires --archive or --run-id + --repo (fails closed)", async () => {
    const runtime = createTestRuntime({
      subprocess: {
        run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        spawn: () => ({ exitCode: Promise.resolve(0) }),
      },
    });
    const result = await runScanLogsCommand({
      deps: { runtime },
      options: { secret: ["a=b"] },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
  });
});

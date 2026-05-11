import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScoring } from "../src/benchmark/scorer.js";

function writeScoringScript(taskRoot, body) {
  const scoringDir = join(taskRoot, "scoring");
  mkdirSync(scoringDir, { recursive: true });
  const path = join(scoringDir, "run.sh");
  writeFileSync(path, body, { encoding: "utf8" });
  chmodSync(path, 0o755);
}

function makeTask(taskRoot) {
  return {
    id: "tf/t",
    paths: {
      instructions: "",
      supervisor: "",
      judge: "",
      specs: "",
      workdir: "",
      scoring: join(taskRoot, "scoring"),
    },
  };
}

function makeCtx(runDir) {
  return { cwd: join(runDir, "cwd"), port: 12345, runDir };
}

describe("runScoring", () => {
  test("exit 0 → verdict pass; details from fd 3 NDJSON", async () => {
    const taskRoot = mkdtempSync(join(tmpdir(), "scorer-"));
    writeScoringScript(
      taskRoot,
      `#!/usr/bin/env bash
printf '{"test":"unit","pass":true}\\n' >&"$RESULTS_FD"
printf '{"test":"unit2","pass":true,"message":"ok"}\\n' >&"$RESULTS_FD"
exit 0
`,
    );
    const runDir = mkdtempSync(join(tmpdir(), "scorer-run-"));
    mkdirSync(join(runDir, "cwd"), { recursive: true });
    const outcome = await runScoring(makeTask(taskRoot), makeCtx(runDir));
    assert.strictEqual(outcome.verdict, "pass");
    assert.strictEqual(outcome.exitCode, 0);
    assert.strictEqual(outcome.details.length, 2);
    assert.strictEqual(outcome.details[0].test, "unit");
  });

  test("exit non-zero → verdict fail (exit code authoritative)", async () => {
    const taskRoot = mkdtempSync(join(tmpdir(), "scorer-"));
    writeScoringScript(
      taskRoot,
      `#!/usr/bin/env bash
printf '{"test":"unit","pass":true}\\n' >&"$RESULTS_FD"
exit 7
`,
    );
    const runDir = mkdtempSync(join(tmpdir(), "scorer-run-"));
    mkdirSync(join(runDir, "cwd"), { recursive: true });
    const outcome = await runScoring(makeTask(taskRoot), makeCtx(runDir));
    assert.strictEqual(outcome.verdict, "fail");
    assert.strictEqual(outcome.exitCode, 7);
    assert.strictEqual(outcome.details[0].test, "unit");
  });

  test("malformed fd-3 lines become parseError rows; verdict not affected", async () => {
    const taskRoot = mkdtempSync(join(tmpdir(), "scorer-"));
    writeScoringScript(
      taskRoot,
      `#!/usr/bin/env bash
printf 'not-json garbage\\n' >&"$RESULTS_FD"
printf '{"test":"ok","pass":true}\\n' >&"$RESULTS_FD"
exit 0
`,
    );
    const runDir = mkdtempSync(join(tmpdir(), "scorer-run-"));
    mkdirSync(join(runDir, "cwd"), { recursive: true });
    const outcome = await runScoring(makeTask(taskRoot), makeCtx(runDir));
    assert.strictEqual(outcome.verdict, "pass");
    assert.strictEqual(outcome.details.length, 2);
    const garbage = outcome.details.find((d) => d.parseError);
    assert.ok(garbage);
  });

  test("spawn failure → verdict fail with -1 exit code", async () => {
    const taskRoot = mkdtempSync(join(tmpdir(), "scorer-"));
    // Don't write scoring/run.sh — file is absent.
    const runDir = mkdtempSync(join(tmpdir(), "scorer-run-"));
    mkdirSync(join(runDir, "cwd"), { recursive: true });
    const outcome = await runScoring(makeTask(taskRoot), makeCtx(runDir));
    assert.strictEqual(outcome.verdict, "fail");
  });
});

import { describe, test } from "node:test";
import assert from "node:assert";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runScoring } from "../src/benchmark/scorer.js";

async function buildStubTask(runShContent) {
  const root = await mkdtemp(join(tmpdir(), "benchmark-scorer-"));
  await mkdir(join(root, "scoring"), { recursive: true });
  await writeFile(join(root, "scoring", "run.sh"), runShContent);
  await chmod(join(root, "scoring", "run.sh"), 0o755);
  const runDir = await mkdtemp(join(tmpdir(), "benchmark-scorer-run-"));
  const cwd = join(runDir, "cwd");
  await mkdir(cwd, { recursive: true });
  return {
    task: {
      id: "tf/scorer",
      paths: {
        instructions: "",
        supervisor: "",
        judge: "",
        specs: "",
        workdir: "",
        scoring: join(root, "scoring"),
      },
    },
    ctx: { cwd, port: 0, runDir },
  };
}

describe("runScoring", () => {
  test("exit 0 → verdict 'pass' with parsed details", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' '{"test":"t1","pass":true}' >&"$RESULTS_FD"
printf '%s\n' '{"test":"t2","pass":true,"message":"ok"}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runScoring(task, ctx);
    assert.strictEqual(out.verdict, "pass");
    assert.strictEqual(out.exitCode, 0);
    assert.strictEqual(out.details.length, 2);
    assert.deepStrictEqual(out.details[0], { test: "t1", pass: true });
  });

  test("non-zero exit → verdict 'fail' with exit code surfaced", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
exit 3
`,
    );
    const out = await runScoring(task, ctx);
    assert.strictEqual(out.verdict, "fail");
    assert.strictEqual(out.exitCode, 3);
    assert.strictEqual(out.details.length, 0);
  });

  test("malformed fd-3 lines survive as raw rows with parseError", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' 'not json' >&"$RESULTS_FD"
printf '%s\n' '{"test":"t1","pass":true}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runScoring(task, ctx);
    assert.strictEqual(out.verdict, "pass");
    assert.strictEqual(out.details.length, 2);
    assert.deepStrictEqual(out.details[0], {
      raw: "not json",
      parseError: true,
    });
    assert.deepStrictEqual(out.details[1], { test: "t1", pass: true });
  });

  test("WORKDIR, PORT, RESULTS_FD env vars reach the script", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' "{\\"workdir\\":\\"$WORKDIR\\",\\"port\\":$PORT,\\"fd\\":$RESULTS_FD,\\"pass\\":true}" >&"$RESULTS_FD"
exit 0
`,
    );
    ctx.port = 12345;
    const out = await runScoring(task, ctx);
    assert.strictEqual(out.verdict, "pass");
    assert.strictEqual(out.details[0].workdir, ctx.cwd);
    assert.strictEqual(out.details[0].port, 12345);
    assert.strictEqual(out.details[0].fd, 3);
  });
});

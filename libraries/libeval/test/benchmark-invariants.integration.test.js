import { describe, test } from "node:test";
import assert from "node:assert";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runInvariants } from "../src/benchmark/invariants.js";

const RT = createDefaultRuntime();

async function buildStubTask(invariantsShContent) {
  const root = await mkdtemp(join(tmpdir(), "benchmark-invariants-"));
  await mkdir(join(root, "hooks"), { recursive: true });
  await writeFile(join(root, "hooks", "invariants.sh"), invariantsShContent);
  await chmod(join(root, "hooks", "invariants.sh"), 0o755);
  const runDir = await mkdtemp(join(tmpdir(), "benchmark-invariants-run-"));
  const cwd = join(runDir, "cwd");
  await mkdir(cwd, { recursive: true });
  return {
    task: {
      id: "invariants",
      paths: {
        instructions: "",
        supervisor: null,
        judge: null,
        hooks: join(root, "hooks"),
        invariants: join(root, "hooks", "invariants.sh"),
        preflight: null,
        specs: "",
        workdir: "",
      },
    },
    ctx: { cwd, port: 0, runDir },
  };
}

describe("runInvariants", () => {
  test("exit 0 → verdict 'pass' with parsed details", async () => {
    const { task, ctx } = await buildStubTask(
      `#!/bin/sh
printf '%s\n' '{"test":"t1","pass":true}' >&"$RESULTS_FD"
printf '%s\n' '{"test":"t2","pass":true,"message":"ok"}' >&"$RESULTS_FD"
exit 0
`,
    );
    const out = await runInvariants(task, ctx, RT);
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
    const out = await runInvariants(task, ctx, RT);
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
    const out = await runInvariants(task, ctx, RT);
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
    const out = await runInvariants(task, ctx, RT);
    assert.strictEqual(out.verdict, "pass");
    assert.strictEqual(out.details[0].workdir, ctx.cwd);
    assert.strictEqual(out.details[0].port, 12345);
    assert.strictEqual(out.details[0].fd, 3);
  });
});

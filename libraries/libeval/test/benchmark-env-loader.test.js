import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import nodeFs from "node:fs/promises";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseEnvFile, loadEnv } from "../src/benchmark/env-loader.js";

/**
 * Build a real-fs runtime for loadEnv with an isolated, test-controlled env
 * map and a captured stderr. Real async fs is used because loadEnv operates on
 * actual temp directories.
 */
function makeRuntime(env = {}) {
  const stderr = [];
  return {
    runtime: {
      fs: nodeFs,
      proc: {
        env: { ...env },
        stderr: { write: (s) => stderr.push(String(s)) },
      },
    },
    get stderr() {
      return stderr.join("");
    },
    get env() {
      return this.runtime.proc.env;
    },
  };
}

describe("parseEnvFile", () => {
  test("parses KEY=VALUE lines", () => {
    const entries = parseEnvFile("FOO=bar\nBAZ=qux\n");
    assert.deepStrictEqual(entries, [
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  test("skips comments and blank lines", () => {
    const entries = parseEnvFile("# comment\n\nFOO=bar\n  # indented\n");
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "bar" }]);
  });

  test("strips double quotes", () => {
    const entries = parseEnvFile('FOO="hello world"\n');
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "hello world" }]);
  });

  test("strips single quotes", () => {
    const entries = parseEnvFile("FOO='hello world'\n");
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "hello world" }]);
  });

  test("handles empty value", () => {
    const entries = parseEnvFile("FOO=\n");
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "" }]);
  });

  test("handles value with equals sign", () => {
    const entries = parseEnvFile("FOO=bar=baz\n");
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "bar=baz" }]);
  });

  test("skips lines without equals", () => {
    const entries = parseEnvFile("NOEQUALSSIGN\nFOO=bar\n");
    assert.deepStrictEqual(entries, [{ key: "FOO", value: "bar" }]);
  });
});

describe("loadEnv", () => {
  let familyDir;
  let taskDir;
  let agentCwd;

  beforeEach(async () => {
    familyDir = await mkdtemp(join(tmpdir(), "env-family-"));
    taskDir = await mkdtemp(join(tmpdir(), "env-task-"));
    agentCwd = await mkdtemp(join(tmpdir(), "env-cwd-"));
  });

  test("loads .env into the env map and renders into agent CWD", async () => {
    await writeFile(join(familyDir, ".env"), "TEST_FAM_VAR=from-family\n");
    const rt = makeRuntime();
    const names = await loadEnv([familyDir], agentCwd, rt.runtime);
    assert.ok(names.includes("TEST_FAM_VAR"));
    assert.strictEqual(rt.env.TEST_FAM_VAR, "from-family");

    const rendered = await readFile(join(agentCwd, ".env"), "utf8");
    assert.ok(rendered.includes("TEST_FAM_VAR=from-family"));
  });

  test("existing env value wins over file values", async () => {
    const rt = makeRuntime({ TEST_EXISTING: "from-shell" });
    await writeFile(join(familyDir, ".env"), "TEST_EXISTING=from-file\n");
    await loadEnv([familyDir], agentCwd, rt.runtime);
    assert.strictEqual(rt.env.TEST_EXISTING, "from-shell");

    const rendered = await readFile(join(agentCwd, ".env"), "utf8");
    assert.ok(
      rendered.includes("TEST_EXISTING=from-shell"),
      "rendered file should contain the env-map value",
    );
  });

  test("merges family and task dirs, family loaded first", async () => {
    await writeFile(
      join(familyDir, ".env"),
      "SHARED=from-family\nFAM_ONLY=1\n",
    );
    await writeFile(join(taskDir, ".env"), "SHARED=from-task\nTASK_ONLY=2\n");
    const rt = makeRuntime();
    const names = await loadEnv([familyDir, taskDir], agentCwd, rt.runtime);

    assert.ok(names.includes("SHARED"));
    assert.ok(names.includes("FAM_ONLY"));
    assert.ok(names.includes("TASK_ONLY"));
    // Family dir loaded first, so its value wins for SHARED
    assert.strictEqual(rt.env.SHARED, "from-family");

    // Rendered .env merges keys from both dirs with resolved values
    const rendered = await readFile(join(agentCwd, ".env"), "utf8");
    assert.ok(rendered.includes("SHARED=from-family"));
    assert.ok(rendered.includes("FAM_ONLY=1"));
    assert.ok(rendered.includes("TASK_ONLY=2"));
  });

  test("renders .env.local into agent CWD", async () => {
    await writeFile(join(taskDir, ".env.local"), "SECRET=s3cr3t\n");
    await loadEnv([taskDir], agentCwd, makeRuntime().runtime);

    const rendered = await readFile(join(agentCwd, ".env.local"), "utf8");
    assert.ok(rendered.includes("SECRET=s3cr3t"));
  });

  test("renders both .env and .env.local when both exist", async () => {
    await writeFile(join(taskDir, ".env"), "A=1\n");
    await writeFile(join(taskDir, ".env.local"), "B=2\n");
    await loadEnv([taskDir], agentCwd, makeRuntime().runtime);

    const dotenv = await readFile(join(agentCwd, ".env"), "utf8");
    const dotenvLocal = await readFile(join(agentCwd, ".env.local"), "utf8");
    assert.ok(dotenv.includes("A=1"));
    assert.ok(dotenvLocal.includes("B=2"));
  });

  test("returns empty array when no env files exist", async () => {
    const names = await loadEnv([familyDir], agentCwd, makeRuntime().runtime);
    assert.deepStrictEqual(names, []);

    await assert.rejects(readFile(join(agentCwd, ".env"), "utf8"), {
      code: "ENOENT",
    });
  });

  test("CI secret overrides file value in rendered output", async () => {
    const rt = makeRuntime({ TASK_SECRET: "from-ci" });
    await writeFile(join(taskDir, ".env.local"), "TASK_SECRET=placeholder\n");
    await loadEnv([taskDir], agentCwd, rt.runtime);

    const rendered = await readFile(join(agentCwd, ".env.local"), "utf8");
    assert.ok(
      rendered.includes("TASK_SECRET=from-ci"),
      `rendered should contain CI value, got: ${rendered}`,
    );
  });

  test("emits warning to stderr for empty-value vars", async () => {
    await writeFile(join(taskDir, ".env"), "MISSING_VAR=\n");
    const rt = makeRuntime();
    await loadEnv([taskDir], agentCwd, rt.runtime);

    assert.ok(
      rt.stderr.includes("MISSING_VAR"),
      `stderr should warn about MISSING_VAR, got: ${rt.stderr}`,
    );
  });
});

import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { createConfig } from "../src/index.js";
import { createMockStorage, spy } from "@forwardimpact/libmock";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

describe("libconfig - loads the .env file", () => {
  const testDir = path.join(tmpdir(), `libconfig-env-test-${process.pid}`);
  const envPath = path.join(testDir, ".env");

  const mockStorageFn = () =>
    createMockStorage({
      get: spy(() => Promise.resolve("")),
    });

  // Real fs (to read the .env written to testDir) with a test-controlled proc.
  // Config mutates `runtime.proc.env`, so tests inspect `.proc.env` afterward.
  const createRuntime = (env = {}) => ({
    ...createDefaultRuntime(),
    proc: { cwd: () => testDir, env },
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  function writeEnvFile(content) {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(envPath, content, "utf8");
  }

  test("loads allowed keys from the .env file", async () => {
    writeEnvFile("GITHUB_TOKEN=from-env-file\nANTHROPIC_API_KEY=sk-ant-test\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "from-env-file");
    const token = await config.anthropicToken();
    assert.strictEqual(token, "sk-ant-test");
  });

  test("process.env overrides the .env file", async () => {
    writeEnvFile("GITHUB_TOKEN=file-value\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime({ GITHUB_TOKEN: "env-value" }),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "env-value");
  });

  test("Config treats GH_TOKEN from the .env file as a credential", async () => {
    writeEnvFile("GH_TOKEN=gh-cli-value\n");

    const runtime = createRuntime();
    const config = await createConfig(
      "test",
      "svc",
      {},
      runtime,
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "gh-cli-value");
    assert.strictEqual(runtime.proc.env.GH_TOKEN, undefined);
  });

  test("loads non-allowed keys into process.env", async () => {
    writeEnvFile(
      "SERVICE_SECRET=my-secret\nSERVICE_MCP_URL=http://localhost:3005\nGITHUB_TOKEN=allowed\n",
    );

    const runtime = createRuntime();
    const config = await createConfig(
      "test",
      "svc",
      {},
      runtime,
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "allowed");
    assert.strictEqual(runtime.proc.env.SERVICE_SECRET, "my-secret");
    assert.strictEqual(
      runtime.proc.env.SERVICE_MCP_URL,
      "http://localhost:3005",
    );
  });

  test("the .env file overwrites inherited process.env for non-credential keys", async () => {
    writeEnvFile("SERVICE_SECRET=from-file\n");

    const runtime = createRuntime({ SERVICE_SECRET: "from-env" });
    await createConfig("test", "svc", {}, runtime, mockStorageFn);

    // .env is the persistent source of truth. Supervised child processes
    // inherit stale values from svscan. Config always applies the .env
    // value, so edits take effect on restart.
    assert.strictEqual(runtime.proc.env.SERVICE_SECRET, "from-file");
  });

  test("skips comments and blank lines", async () => {
    writeEnvFile(
      "# This is a comment\n\n  \nGITHUB_TOKEN=secret-value\n# another comment\n",
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "secret-value");
  });

  test("strips the quotes around values", async () => {
    writeEnvFile(
      "GITHUB_TOKEN=\"double-quoted\"\nANTHROPIC_API_KEY='single-quoted'\n",
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "double-quoted");
    const token = await config.anthropicToken();
    assert.strictEqual(token, "single-quoted");
  });

  test("handles values that contain equals signs", async () => {
    writeEnvFile("GITHUB_TOKEN=abc=def=ghi\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "abc=def=ghi");
  });

  test("continues gracefully when the .env file does not exist", async () => {
    mkdirSync(testDir, { recursive: true });
    // The test writes no .env file

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.throws(() => config.ghToken(), /GH_TOKEN not found in environment/);
  });

  test("throws on non-ENOENT errors (e.g. permission denied)", async () => {
    // The test cannot enforce file permissions as root. The early return
    // acts as a skip.
    if (process.getuid?.() === 0) return;

    writeEnvFile("GITHUB_TOKEN=secret\n");
    chmodSync(envPath, 0o000);

    await assert.rejects(
      () => createConfig("test", "svc", {}, createRuntime(), mockStorageFn),
      (error) => error.code === "EACCES",
    );

    // Restore permissions so afterEach cleanup works
    chmodSync(envPath, 0o644);
  });

  test("does not set .env values on the data object", async () => {
    writeEnvFile("GITHUB_TOKEN=token\nANTHROPIC_API_KEY=sk-ant-test\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    // Only the getter methods expose these. They are not properties.
    assert.strictEqual(config.GITHUB_TOKEN, undefined);
    assert.strictEqual(config.ANTHROPIC_API_KEY, undefined);
  });

  test("reset clears the .env overrides", async () => {
    writeEnvFile("GITHUB_TOKEN=from-file\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "from-file");
    config.reset();

    // reset() clears the .env overrides. No process env value remains.
    assert.throws(() => config.ghToken(), /GH_TOKEN not found in environment/);
  });

  test("loads all allowed keys", async () => {
    writeEnvFile(
      [
        "GITHUB_TOKEN=gh-token",
        "MCP_TOKEN=mcp-tok",
        "ANTHROPIC_API_KEY=sk-ant-test",
      ].join("\n"),
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "gh-token");
    assert.strictEqual(await config.anthropicToken(), "sk-ant-test");
    assert.strictEqual(config.mcpToken(), "mcp-tok");
  });

  test("values do not leak through Object.keys or JSON.stringify", async () => {
    writeEnvFile("GITHUB_TOKEN=token\nANTHROPIC_API_KEY=secret\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.ok(!Object.keys(config).includes("GITHUB_TOKEN"));
    assert.ok(!Object.keys(config).includes("ANTHROPIC_API_KEY"));
    const serialized = JSON.stringify(config);
    assert.ok(!serialized.includes("token"));
    assert.ok(!serialized.includes("secret"));
  });

  test("Config isolates Supabase secret keys from process.env", async () => {
    writeEnvFile(
      [
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_ANON_KEY=anon-jwt",
        "SUPABASE_SERVICE_ROLE_KEY=service-role-jwt",
        "JWT_SECRET=signing-secret",
      ].join("\n"),
    );

    const runtime = createRuntime();
    const config = await createConfig(
      "test",
      "svc",
      {},
      runtime,
      mockStorageFn,
    );

    assert.strictEqual(config.supabaseAnonKey(), "anon-jwt");
    assert.strictEqual(config.supabaseServiceRoleKey(), "service-role-jwt");
    assert.strictEqual(config.supabaseJwtSecret(), "signing-secret");

    // SUPABASE_URL is non-credential. It must remain on process.env so
    // docker-compose's ${SUPABASE_URL} interpolation works at the shell
    // level (design § Key Decisions row 7).
    assert.strictEqual(runtime.proc.env.SUPABASE_URL, "http://127.0.0.1:54321");
    assert.strictEqual(config.supabaseUrl(), "http://127.0.0.1:54321");

    // Three secret values must NOT leak onto process.env.
    assert.strictEqual(runtime.proc.env.SUPABASE_ANON_KEY, undefined);
    assert.strictEqual(runtime.proc.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.strictEqual(runtime.proc.env.JWT_SECRET, undefined);
  });

  test("strips the export prefix on keys", async () => {
    writeEnvFile("export GITHUB_TOKEN=exported-value\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "exported-value");
  });

  test("handles adversarial values safely", async () => {
    writeEnvFile(
      [
        "GITHUB_TOKEN=value\x00with-null",
        "ANTHROPIC_API_KEY=" + "a".repeat(10000),
      ].join("\n"),
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createRuntime(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghToken(), "value\x00with-null");
    const token = await config.anthropicToken();
    assert.strictEqual(token.length, 10000);
  });
});

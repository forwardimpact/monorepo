import { test, describe } from "node:test";
import assert from "node:assert";

import { createConfig } from "../src/index.js";
import {
  createMockStorage,
  createMockSubprocess,
  createTestRuntime,
  spy,
} from "@forwardimpact/libmock";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// Wrap a test proc as a runtime bag (real fs + test-controlled proc).
const rt = (proc) => ({ ...createDefaultRuntime(), proc });

describe("libconfig - Config getters (core + github)", () => {
  const mockStorageFn = () =>
    createMockStorage({
      get: spy(() => Promise.resolve("")),
    });

  test("init returns init config from file data", async () => {
    const mockStorage = createMockStorage({
      get: spy(() =>
        Promise.resolve({
          init: {
            log_dir: "data/logs",
            shutdown_timeout: 5000,
            services: [{ name: "api", command: "bun start" }],
          },
        }),
      ),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      () => mockStorage,
    );

    assert.ok(config.init);
    assert.strictEqual(config.init.log_dir, "data/logs");
    assert.strictEqual(config.init.shutdown_timeout, 5000);
  });

  test("init returns null when not present in file", async () => {
    const mockStorage = createMockStorage({
      get: spy(() => Promise.resolve({})),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      () => mockStorage,
    );

    assert.strictEqual(config.init, null);
  });

  test("rootDir returns parent of config directory", async () => {
    const mockStorage = createMockStorage({
      get: spy(() => Promise.resolve({})),
      path: spy(() => "/project/root/config"),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      () => mockStorage,
    );

    assert.strictEqual(config.rootDir, "/project/root");
  });

  test("ghToken throws when not set in environment and gh cli fails", async () => {
    // gh exits non-zero (e.g. not authenticated / not installed).
    const subprocess = createMockSubprocess({
      responses: { gh: { exitCode: 1, stderr: "gh: not authenticated" } },
    });
    const config = await createConfig(
      "test",
      "myservice",
      {},
      { runtime: createTestRuntime({ subprocess }) },
      mockStorageFn,
    );
    assert.throws(() => config.ghToken(), /GH_TOKEN not found in environment/);
  });

  test("ghToken returns from environment", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GH_TOKEN: "gh-cli-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "gh-cli-token");
  });

  test("ghToken falls back to GITHUB_TOKEN when GH_TOKEN is unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GITHUB_TOKEN: "actions-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "actions-token");
  });

  test("ghToken prefers GH_TOKEN when both are set", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GITHUB_TOKEN: "github-token", GH_TOKEN: "gh-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "gh-token");
  });

  test("ghToken falls back to gh auth token when env vars are unset", async () => {
    const subprocess = createMockSubprocess({
      responses: { gh: { stdout: "fake-gh-cli-token\n" } },
    });
    const config = await createConfig(
      "test",
      "myservice",
      {},
      { runtime: createTestRuntime({ subprocess }) },
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "fake-gh-cli-token");
    assert.strictEqual(subprocess.calls.length, 1);
    assert.strictEqual(subprocess.calls[0].cmd, "gh");
    assert.deepStrictEqual(subprocess.calls[0].args, ["auth", "token"]);
  });

  test("ghToken caches gh auth token result", async () => {
    const subprocess = createMockSubprocess({
      responses: { gh: { stdout: "fake-gh-cli-token" } },
    });
    const config = await createConfig(
      "test",
      "myservice",
      {},
      { runtime: createTestRuntime({ subprocess }) },
      mockStorageFn,
    );
    const first = config.ghToken();
    const second = config.ghToken();
    assert.strictEqual(first, second);
    assert.strictEqual(subprocess.calls.length, 1);
  });

});

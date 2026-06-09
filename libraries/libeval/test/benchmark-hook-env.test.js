import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildHookEnv } from "../src/benchmark/hook-env.js";

describe("buildHookEnv", () => {
  test("maps all vars and stringifies the port", () => {
    const env = buildHookEnv(
      { PATH: "/bin", ANTHROPIC_API_KEY: "secret" },
      {
        cwd: "/run/cwd",
        port: 4242,
        taskId: "spec-feature",
        taskDir: "/fam/tasks/spec-feature",
        hooksDir: "/fam/tasks/spec-feature/hooks",
        familyDir: "/fam",
      },
    );
    assert.equal(env.WORKDIR, "/run/cwd");
    assert.equal(env.PORT, "4242");
    assert.equal(env.TASK_ID, "spec-feature");
    assert.equal(env.TASK_DIR, "/fam/tasks/spec-feature");
    assert.equal(env.HOOKS_DIR, "/fam/tasks/spec-feature/hooks");
    assert.equal(env.FAMILY_DIR, "/fam");
  });

  test("inherits the base env", () => {
    const env = buildHookEnv(
      { PATH: "/bin", HOME: "/root" },
      { cwd: "/c", port: 0 },
    );
    assert.equal(env.PATH, "/bin");
    assert.equal(env.HOME, "/root");
  });

  test("absent path vars become empty strings, never undefined", () => {
    const env = buildHookEnv({}, { cwd: "/c", port: 1 });
    assert.equal(env.TASK_ID, "");
    assert.equal(env.TASK_DIR, "");
    assert.equal(env.HOOKS_DIR, "");
    assert.equal(env.FAMILY_DIR, "");
  });

  test("null familyDir is coerced to empty string", () => {
    const env = buildHookEnv({}, { cwd: "/c", port: 1, familyDir: null });
    assert.equal(env.FAMILY_DIR, "");
  });
});

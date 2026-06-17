/**
 * spawn-env unit tests — env allow-set filtering and tilde expansion.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_ENV_ALLOWSET, buildSpawnEnv } from "../src/spawn-env.js";

describe("buildSpawnEnv", () => {
  test("passes an allow-set member through and reports no rejections", () => {
    const { env, rejections } = buildSpawnEnv(
      { ANTHROPIC_API_KEY: "sk-test" },
      { HOME: "/home/u" },
    );
    assert.strictEqual(env.ANTHROPIC_API_KEY, "sk-test");
    assert.strictEqual(env.HOME, "/home/u");
    assert.deepStrictEqual(rejections, []);
  });

  test("drops a non-member and lists it in rejections", () => {
    const { env, rejections } = buildSpawnEnv(
      { NODE_OPTIONS: "--require=/tmp/evil.js", PATH: "/evil" },
      { HOME: "/home/u", PATH: "/usr/bin" },
    );
    assert.strictEqual(env.NODE_OPTIONS, undefined);
    assert.strictEqual(env.PATH, "/usr/bin");
    assert.deepStrictEqual(rejections.sort(), ["NODE_OPTIONS", "PATH"].sort());
  });

  test("home-expands a tilde-prefixed allow-set value", () => {
    const { env } = buildSpawnEnv({ ANTHROPIC_API_KEY: "~/certs/x.pem" }, {});
    assert.strictEqual(env.ANTHROPIC_API_KEY, join(homedir(), "certs/x.pem"));
  });

  test("undefined configEnv returns base env with empty rejections", () => {
    const { env, rejections } = buildSpawnEnv(undefined, { HOME: "/home/u" });
    assert.strictEqual(env.HOME, "/home/u");
    assert.deepStrictEqual(rejections, []);
  });

  test("AGENT_ENV_ALLOWSET is frozen", () => {
    assert.ok(Object.isFrozen(AGENT_ENV_ALLOWSET));
    assert.throws(() => AGENT_ENV_ALLOWSET.add("PATH"));
  });

  // Spec Success Criterion 2: the three wake paths (scheduler tick, socket,
  // direct-CLI) all forward config.env into this one function with the same
  // base env, so identical config yields an identical filtered spawn env.
  // The single-function convergence is the property under test.
  test("same configEnv and base env yield an identical filtered env", () => {
    const configEnv = {
      ANTHROPIC_API_KEY: "sk-x",
      NODE_OPTIONS: "--require=/tmp/evil.js",
    };
    const baseEnv = { HOME: "/home/u", PATH: "/usr/bin" };
    const a = buildSpawnEnv(configEnv, baseEnv);
    const b = buildSpawnEnv(configEnv, baseEnv);
    assert.deepStrictEqual(a.env, b.env);
    assert.deepStrictEqual(a.rejections, b.rejections);
    assert.strictEqual(a.env.ANTHROPIC_API_KEY, "sk-x");
    assert.strictEqual(a.env.NODE_OPTIONS, undefined);
    assert.deepStrictEqual(a.rejections, ["NODE_OPTIONS"]);
  });
});

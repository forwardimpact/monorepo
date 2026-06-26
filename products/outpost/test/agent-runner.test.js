/**
 * AgentRunner unit tests
 *
 * Tests environment building and agent wake logic against injected mock
 * collaborators (runtime fs/proc/clock + a stubbed posix-spawn module).
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { AgentRunner } from "../src/agent-runner.js";
import {
  TEST_KB,
  POSTURE_PATH,
  DRAFT_TOKENS,
  postureCfg,
  createMockSpawn,
  createMockStateManager,
  makeRuntime,
} from "./helpers.js";

describe("AgentRunner", () => {
  describe("constructor validation", () => {
    test("throws when runtime is missing", () => {
      assert.throws(
        () =>
          new AgentRunner(
            createMockSpawn().module,
            createMockStateManager(),
            () => {},
            "/tmp/cache",
          ),
        /runtime.fs is required/,
      );
    });
  });

  describe("#buildSpawnEnv (via wake)", () => {
    test("passes runtime.proc.env to spawned process by default", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u", PATH: "/usr/bin" }),
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].env.HOME, "/home/u");
      assert.strictEqual(calls[0].env.PATH, "/usr/bin");
    });

    test("merges allow-set configEnv into spawn environment", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
        postureCfg(),
      );

      const configEnv = { ANTHROPIC_API_KEY: "sk-test-123" };
      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
        configEnv,
      );

      assert.strictEqual(calls.length, 1);
      const env = calls[0].env;
      assert.strictEqual(env.ANTHROPIC_API_KEY, "sk-test-123");
      assert.strictEqual(env.HOME, "/home/u");
    });

    test("drops configEnv keys outside the allow-set", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
        postureCfg(),
      );

      const configEnv = { NODE_EXTRA_CA_CERTS: "/etc/ssl/custom-ca.pem" };
      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
        configEnv,
      );

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].env.NODE_EXTRA_CA_CERTS, undefined);
      assert.strictEqual(calls[0].env.HOME, "/home/u");
    });

    test("allow-set configEnv overrides runtime.proc.env values", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ ANTHROPIC_API_KEY: "sk-from-process" }),
        postureCfg(),
      );

      const configEnv = { ANTHROPIC_API_KEY: "sk-from-config" };
      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
        configEnv,
      );

      assert.strictEqual(calls[0].env.ANTHROPIC_API_KEY, "sk-from-config");
    });

    test("expands ~ in allow-set configEnv values", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({}),
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
        { ANTHROPIC_API_KEY: "~/certs/ca-bundle.pem" },
      );

      const env = calls[0].env;
      assert.ok(!env.ANTHROPIC_API_KEY.startsWith("~"), "~ should be expanded");
      assert.ok(
        env.ANTHROPIC_API_KEY.endsWith("/certs/ca-bundle.pem"),
        "path suffix should be preserved",
      );
    });

    test("drops a non-allow-set key and logs one rejection", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const logged = [];
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        (line) => logged.push(line),
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
        postureCfg(),
      );

      const agent = { kb: TEST_KB, privilege: "full" };
      const state = { agents: {} };
      const configEnv = { NODE_OPTIONS: "--require=/tmp/evil.js" };
      await runner.wake("test-agent", agent, state, configEnv);

      // The attacker's config value must never reach the spawn env. (The
      // daemon's own inherited NODE_OPTIONS, if any, is not config-supplied.)
      assert.notStrictEqual(
        calls[0].env.NODE_OPTIONS,
        "--require=/tmp/evil.js",
      );
      const rejections = logged
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((r) => r && r.event === "outpost.spawn_env.rejected");
      assert.strictEqual(rejections.length, 1);
      assert.strictEqual(rejections[0].key, "NODE_OPTIONS");
      assert.strictEqual(rejections[0].agent, "test-agent");
    });

    test("handles undefined configEnv (no extra vars)", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
        undefined,
      );

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(typeof calls[0].env, "object");
    });
  });

  describe("killActiveChildren", () => {
    test("sends SIGTERM via runtime.proc.kill to tracked children", async () => {
      const { module: spawnMod } = createMockSpawn();
      const runtime = makeRuntime({ HOME: "/home/u" });
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        runtime,
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );
      // pid 999 was tracked during wake but removed on exit; force one in.
      runner.activeChildren.add(4242);
      runner.killActiveChildren();

      assert.deepStrictEqual(runtime.proc.kills, [
        { pid: 4242, signal: "SIGTERM" },
      ]);
    });
  });

  describe("posture gate (via wake)", () => {
    test("brief posture denies draft skills and injects the brief directive", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runtime = makeRuntime(
        { HOME: "/home/u" },
        { [POSTURE_PATH]: JSON.stringify({ posture: "brief" }) },
      );
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        runtime,
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );

      const args = calls[0].args;
      const denyIdx = args.indexOf("--disallowedTools");
      assert.ok(denyIdx >= 0, "--disallowedTools present under brief");
      assert.strictEqual(args[denyIdx + 1], DRAFT_TOKENS);
      const promptIdx = args.indexOf("--append-system-prompt");
      assert.ok(promptIdx >= 0, "--append-system-prompt present under brief");
      assert.match(args[promptIdx + 1], /posture: brief/i);
      assert.match(args[promptIdx + 1], /knowledge base/i);
    });

    test("absent posture record defaults to brief", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      // No posture.json seeded — reads as null, effective = brief.
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime({ HOME: "/home/u" }),
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );

      assert.ok(calls[0].args.includes("--disallowedTools"));
    });

    test("brief+draft posture adds no gating flags", async () => {
      const { module: spawnMod, calls } = createMockSpawn();
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        makeRuntime(
          { HOME: "/home/u" },
          { [POSTURE_PATH]: JSON.stringify({ posture: "brief+draft" }) },
        ),
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );

      const args = calls[0].args;
      assert.ok(!args.includes("--disallowedTools"));
      assert.ok(!args.includes("--append-system-prompt"));
    });

    test("a brief wake never writes the posture record", async () => {
      const { module: spawnMod } = createMockSpawn();
      const runtime = makeRuntime(
        { HOME: "/home/u" },
        { [POSTURE_PATH]: JSON.stringify({ posture: "brief" }) },
      );
      const runner = new AgentRunner(
        spawnMod,
        createMockStateManager(),
        () => {},
        "/tmp/cache",
        runtime,
        postureCfg(),
      );

      await runner.wake(
        "test-agent",
        { kb: TEST_KB, privilege: "full" },
        { agents: {} },
      );

      const wrotePosture = runtime.fs.writeFile.mock.calls.some(
        (c) => c.arguments[0] === POSTURE_PATH,
      );
      assert.ok(!wrotePosture, "wake must not write posture.json");
    });
  });
});

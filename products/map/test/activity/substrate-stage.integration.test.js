/**
 * Real-fs substrate-stage cases: the copy-activity ENOENT path (which depends
 * on a real fs.cp raising against a missing source — the in-memory fs does not)
 * and the bootstrap-shape parity check (which materialises and compares two
 * real project-root trees). Phase-ordering unit tests live in the sibling
 * substrate-stage.test.js.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runStageCommand } from "../../src/commands/substrate-stage.js";
import { runInit } from "../../src/commands/init.js";
import { copyActivity } from "../../src/lib/copy-activity.js";

/** A real-fs runtime with a quiet proc. */
function quietRealRuntime() {
  const base = createDefaultRuntime();
  return {
    ...base,
    proc: {
      ...base.proc,
      stdout: { write: () => true },
      stderr: { write: () => true },
    },
  };
}

function buildDeps({ failPhase = null, invocations }) {
  function recorded(name, fn = async () => undefined) {
    return async (...args) => {
      invocations.push(name);
      if (failPhase === name) throw new Error(`stubbed ${name} failure`);
      return fn(...args);
    };
  }
  const cliStub = {
    run: async (args) => {
      if (args[0] === "start") return recorded("stack")();
      if (args[0] === "db" && args[1] === "reset") return recorded("migrate")();
      throw new Error(`unexpected supabase run: ${args.join(" ")}`);
    },
    capture: recorded("url-discovery", async () =>
      JSON.stringify({
        API_URL: "http://supabase.local",
        ANON_KEY: "anon-key",
      }),
    ),
  };
  return {
    loadInit: async () => recorded("init"),
    loadCopyActivity: async () => recorded("copy-activity"),
    createSupabaseCli: () => cliStub,
    createMapClient: () => ({ stub: true }),
    findDataDir: async () => "/tmp/data/pathway",
    loadSeed: async () => recorded("seed"),
    loadProvision: async () => recorded("provision"),
    loadSmoke: async () => recorded("smoke"),
    reloadConfig: async () => ({ supabaseJwtSecret: () => "secret" }),
  };
}

describe("substrate-stage copy-activity against missing source", () => {
  test("real copy-activity helper against missing source wraps under [substrate stage: copy-activity]", async () => {
    // Build a tmp root whose sibling `data/activity` does NOT exist so
    // copyActivity's fs.cp call raises ENOENT against the real filesystem.
    const absentRoot = await fs.mkdtemp(
      path.join(tmpdir(), "substrate-missing-source-"),
    );
    const target = await fs.mkdtemp(
      path.join(tmpdir(), "substrate-missing-target-"),
    );
    const invocations = [];
    const deps = buildDeps({ invocations });
    deps.loadCopyActivity = async () => copyActivity;
    deps.findDataDir = async () => path.join(absentRoot, "data", "pathway");
    const config = { supabaseJwtSecret: () => "secret" };
    const realRuntime = quietRealRuntime();
    try {
      await assert.rejects(
        () => runStageCommand({ config, target, runtime: realRuntime }, deps),
        /\[substrate stage: copy-activity\]/,
      );
    } finally {
      await fs.rm(absentRoot, { recursive: true, force: true });
      await fs.rm(target, { recursive: true, force: true });
    }
  });
});

describe("substrate-stage / fit-map init bootstrap-shape parity", () => {
  let tmpA;
  let tmpB;
  let runtime;

  beforeEach(async () => {
    tmpA = await fs.mkdtemp(path.join(tmpdir(), "substrate-parity-a-"));
    tmpB = await fs.mkdtemp(path.join(tmpdir(), "substrate-parity-b-"));
    runtime = quietRealRuntime();
  });

  afterEach(async () => {
    for (const d of [tmpA, tmpB]) {
      try {
        await fs.rm(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test("runInit(tmpA) and substrate stage init phase against tmpB produce identical project root trees", async () => {
    await runInit(tmpA, runtime);

    // Run only the init phase of substrate stage against tmpB. Stubbing
    // every other phase isolates the bootstrap surface — what substrate
    // stage materialises at the target dir.
    const invocations = [];
    function recorded(name, fn = async () => undefined) {
      return async (...args) => {
        invocations.push(name);
        return fn(...args);
      };
    }
    await runStageCommand(
      {
        config: { supabaseJwtSecret: () => "secret" },
        target: tmpB,
        runtime,
      },
      {
        loadInit: async () => runInit,
        loadCopyActivity: async () => async () => {},
        createSupabaseCli: () => ({
          run: recorded("noop"),
          capture: recorded("noop", async () =>
            JSON.stringify({
              API_URL: "http://x",
              ANON_KEY: "a",
            }),
          ),
        }),
        createMapClient: () => ({ stub: true }),
        findDataDir: async () => "/tmp/data/pathway",
        loadSeed: async () => recorded("noop"),
        loadProvision: async () => recorded("noop"),
        loadSmoke: async () => recorded("noop"),
        reloadConfig: async () => ({ supabaseJwtSecret: () => "secret" }),
      },
    );

    const treeA = await listTree(tmpA);
    const treeB = await listTree(tmpB);
    assert.deepEqual(treeA, treeB);
  });
});

async function listTree(root) {
  const out = [];
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push(r + "/");
        await walk(full, r);
      } else {
        out.push(r);
      }
    }
  }
  await walk(root, "");
  out.sort();
  return out;
}

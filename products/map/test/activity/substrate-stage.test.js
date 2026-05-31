/**
 * Tests for `fit-map substrate stage` — uses injected dependency
 * overrides to stub out the init phase, Supabase CLI, mapClient, seed,
 * provision, and the self-smoke so the phase ordering is verifiable
 * without a live stack.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createTestRuntime, createMockProcess } from "@forwardimpact/libmock";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runStageCommand } from "../../src/commands/substrate-stage.js";
import { runInit } from "../../src/commands/init.js";
import { copyActivity } from "../../src/lib/copy-activity.js";

/** A real-fs runtime with a quiet proc (for the bootstrap-parity test). */
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
        api_url: "http://supabase.local",
        anon_key: "anon-key",
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

describe("substrate-stage phase ordering", () => {
  let invocations;
  let runtime;

  beforeEach(() => {
    invocations = [];
    // The url-discovery phase writes SUPABASE_URL/ANON_KEY to the injected
    // proc.env (a Proxy over a per-test backing object), so it never touches
    // the global process — no snapshot/restore needed. cwd defaults to a
    // fixed mock value; tests that need an explicit target pass it.
    runtime = createTestRuntime({
      proc: createMockProcess({ cwd: "/work" }),
    });
  });

  test("invokes phases in init → copy-activity → stack → url-discovery → migrate → seed → provision → smoke order", async () => {
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await runStageCommand({ config, runtime }, deps);
    assert.deepEqual(invocations, [
      "init",
      "copy-activity",
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
      "smoke",
    ]);
  });

  test("SUBSTRATE_FORCE_EMPTY_CORPUS=true short-circuits smoke phase with named error", async () => {
    runtime.proc.env.SUBSTRATE_FORCE_EMPTY_CORPUS = "true";
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config, runtime }, deps),
      /\[substrate stage: smoke\] empty corpus/,
    );
    assert.deepEqual(invocations, [
      "init",
      "copy-activity",
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
    ]);
  });

  test("each phase failure is wrapped in [substrate stage: <phase>] prefix", async () => {
    const deps = buildDeps({ invocations, failPhase: "seed" });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config, runtime }, deps),
      /\[substrate stage: seed\] stubbed seed failure/,
    );
  });

  test("explicit target is plumbed to the init phase", async () => {
    let initTarget;
    const deps = buildDeps({ invocations });
    deps.loadInit = async () => async (t) => {
      invocations.push("init");
      initTarget = t;
    };
    const config = { supabaseJwtSecret: () => "secret" };
    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "substrate-target-"));
    try {
      await runStageCommand({ config, target: tmpDir, runtime }, deps);
      assert.equal(initTarget, tmpDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("real copy-activity helper against missing source wraps under [substrate stage: copy-activity]", async () => {
    // Build a tmp root whose sibling `data/activity` does NOT exist so
    // copyActivity's fs.cp call raises ENOENT.
    const absentRoot = await fs.mkdtemp(
      path.join(tmpdir(), "substrate-missing-source-"),
    );
    const target = await fs.mkdtemp(
      path.join(tmpdir(), "substrate-missing-target-"),
    );
    const deps = buildDeps({ invocations });
    deps.loadCopyActivity = async () => copyActivity;
    deps.findDataDir = async () => path.join(absentRoot, "data", "pathway");
    const config = { supabaseJwtSecret: () => "secret" };
    // This case exercises the REAL copyActivity helper against a missing
    // source on disk, so it needs a real-fs runtime (the describe's default
    // mock-fs runtime would not raise ENOENT).
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
              api_url: "http://x",
              anon_key: "a",
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

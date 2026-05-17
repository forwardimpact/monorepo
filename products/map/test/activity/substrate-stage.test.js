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

import { runStageCommand } from "../../src/commands/substrate-stage.js";
import { runInit } from "../../src/commands/init.js";

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
  let stdoutWrite;
  let prevSupabaseUrl;
  let prevSupabaseAnonKey;

  beforeEach(() => {
    invocations = [];
    delete process.env.SUBSTRATE_FORCE_EMPTY_CORPUS;
    // The url-discovery phase writes SUPABASE_URL/ANON_KEY to process.env
    // (intentional in production; see no-supabase-env-in-src.test.js ALLOW
    // entry). Snapshot whatever's there and restore in afterEach so
    // subsequent tests in this Bun process don't inherit the stub values.
    prevSupabaseUrl = process.env.SUPABASE_URL;
    prevSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    stdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
  });

  afterEach(() => {
    delete process.env.SUBSTRATE_FORCE_EMPTY_CORPUS;
    if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevSupabaseUrl;
    if (prevSupabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = prevSupabaseAnonKey;
    process.stdout.write = stdoutWrite;
  });

  test("invokes phases in init → stack → url-discovery → migrate → seed → provision → smoke order", async () => {
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await runStageCommand({ config }, deps);
    assert.deepEqual(invocations, [
      "init",
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
      "smoke",
    ]);
  });

  test("SUBSTRATE_FORCE_EMPTY_CORPUS=true short-circuits smoke phase with named error", async () => {
    process.env.SUBSTRATE_FORCE_EMPTY_CORPUS = "true";
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config }, deps),
      /\[substrate stage: smoke\] empty corpus/,
    );
    assert.deepEqual(invocations, [
      "init",
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
      () => runStageCommand({ config }, deps),
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
      await runStageCommand({ config, target: tmpDir }, deps);
      assert.equal(initTarget, tmpDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("substrate-stage / fit-map init bootstrap-shape parity", () => {
  let tmpA;
  let tmpB;
  let prevStdout;
  let prevStderr;

  beforeEach(async () => {
    tmpA = await fs.mkdtemp(path.join(tmpdir(), "substrate-parity-a-"));
    tmpB = await fs.mkdtemp(path.join(tmpdir(), "substrate-parity-b-"));
    prevStdout = process.stdout.write.bind(process.stdout);
    prevStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => true;
    process.stderr.write = () => true;
  });

  afterEach(async () => {
    process.stdout.write = prevStdout;
    process.stderr.write = prevStderr;
    for (const d of [tmpA, tmpB]) {
      try {
        await fs.rm(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test("runInit(tmpA) and substrate stage init phase against tmpB produce identical project root trees", async () => {
    await runInit(tmpA);

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
      },
      {
        loadInit: async () => runInit,
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

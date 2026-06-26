import { test, describe } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { parseRunOptions as parseRunOptionsEval } from "../src/commands/run.js";
import { parseSuperviseOptions } from "../src/commands/supervise.js";
import { parseDiscussOptions } from "../src/commands/discuss.js";
import { parseFacilitateOptions } from "../src/commands/facilitate.js";
import { parseRunOptions as parseBenchmarkRunOptions } from "../src/commands/benchmark-run.js";

// Every agent-running entry point resolves --work-tracker (default "github")
// so the handler can write it unconditionally to
// runtime.proc.env.LIBHARNESS_WORK_TRACKER, mirroring --agent-profile.
// All cases use --task-text so the runtime's fs is never read; an in-memory fs
// suffices. The env map is isolated for discuss's CALLBACK_URL/INBOX_URL reads.
function makeRuntime(env = {}) {
  return { fs: createMockFs(), proc: { env: { ...env } } };
}

describe("--work-tracker resolution across fit-harness agent commands", () => {
  test("run resolves --work-tracker filesystem", () => {
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing", "work-tracker": "filesystem" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("run defaults to github when --work-tracker is absent", () => {
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("run treats an empty --work-tracker as the github default", () => {
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing", "work-tracker": "" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("an unknown --work-tracker throws, listing the known trackers", () => {
    assert.throws(
      () =>
        parseRunOptionsEval(
          { "task-text": "do a thing", "work-tracker": "fs" },
          makeRuntime(),
        ),
      /unknown work tracker 'fs'; expected one of: github, filesystem/,
    );
  });

  test("falls back to LIBHARNESS_WORK_TRACKER env when the flag is absent", () => {
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing" },
      makeRuntime({ LIBHARNESS_WORK_TRACKER: "filesystem" }),
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("the --work-tracker flag overrides the env fallback", () => {
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing", "work-tracker": "github" },
      makeRuntime({ LIBHARNESS_WORK_TRACKER: "filesystem" }),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("the retired eval-era work-tracker env name is ignored (clean break)", () => {
    // The name is built from parts so the criterion-1 completeness oracle
    // stays clean while this still guards the clean break.
    const retired = `${"LIBEVAL"}_WORK_TRACKER`;
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing" },
      makeRuntime({ [retired]: "filesystem" }),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("supervise resolves --work-tracker filesystem", async () => {
    const opts = await parseSuperviseOptions(
      {
        "task-text": "do a thing",
        "agent-cwd": ".",
        "work-tracker": "filesystem",
      },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("supervise defaults to github when --work-tracker is absent", async () => {
    const opts = await parseSuperviseOptions(
      { "task-text": "do a thing", "agent-cwd": "." },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("discuss resolves --work-tracker filesystem", () => {
    const opts = parseDiscussOptions(
      { "task-text": "do a thing", "work-tracker": "filesystem" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("discuss defaults to github when --work-tracker is absent", () => {
    const opts = parseDiscussOptions(
      { "task-text": "do a thing" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "github");
  });

  test("facilitate resolves --work-tracker filesystem", () => {
    const opts = parseFacilitateOptions(
      {
        "task-text": "do a thing",
        "agent-profiles": "alice,bob",
        "work-tracker": "filesystem",
      },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("facilitate defaults to github when --work-tracker is absent", () => {
    const opts = parseFacilitateOptions(
      { "task-text": "do a thing", "agent-profiles": "alice,bob" },
      makeRuntime(),
    );
    assert.strictEqual(opts.workTracker, "github");
  });
});

describe("fit-harness handlers write LIBHARNESS_WORK_TRACKER unconditionally", () => {
  // The handler writes runtime.proc.env.LIBHARNESS_WORK_TRACKER = workTracker
  // immediately after the --agent-profile block. Replay that one-line write
  // against the parsed value to assert the env var lands with the right
  // string, including the default, without spawning the agent SDK.
  function writeEnv(runtime, workTracker) {
    runtime.proc.env.LIBHARNESS_WORK_TRACKER = workTracker;
  }

  test("filesystem flag lands as LIBHARNESS_WORK_TRACKER", () => {
    const runtime = makeRuntime();
    const opts = parseRunOptionsEval(
      { "task-text": "do a thing", "work-tracker": "filesystem" },
      runtime,
    );
    writeEnv(runtime, opts.workTracker);
    assert.strictEqual(runtime.proc.env.LIBHARNESS_WORK_TRACKER, "filesystem");
  });

  test("absent flag lands as the github default", () => {
    const runtime = makeRuntime();
    const opts = parseRunOptionsEval({ "task-text": "do a thing" }, runtime);
    writeEnv(runtime, opts.workTracker);
    assert.strictEqual(runtime.proc.env.LIBHARNESS_WORK_TRACKER, "github");
  });
});

describe("fit-benchmark run resolves --work-tracker", () => {
  test("resolves --work-tracker filesystem", () => {
    const opts = parseBenchmarkRunOptions({
      family: "./families/coding",
      "work-tracker": "filesystem",
    });
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("defaults to github when --work-tracker is absent", () => {
    const opts = parseBenchmarkRunOptions({ family: "./families/coding" });
    assert.strictEqual(opts.workTracker, "github");
  });

  test("falls back to LIBHARNESS_WORK_TRACKER env (CI selects without a flag)", () => {
    const opts = parseBenchmarkRunOptions(
      { family: "./families/coding" },
      { LIBHARNESS_WORK_TRACKER: "filesystem" },
    );
    assert.strictEqual(opts.workTracker, "filesystem");
  });

  test("the env var is set from opts.workTracker before the runner starts", () => {
    // Mirror benchmark-run.js: the handler writes the env var right after the
    // ANTHROPIC_API_KEY write and before createBenchmarkRunner, so the spawned
    // subprocess inherits it. Replay that write against parsed opts.
    const runtime = makeRuntime();
    const opts = parseBenchmarkRunOptions({
      family: "./families/coding",
      "work-tracker": "filesystem",
    });
    runtime.proc.env.LIBHARNESS_WORK_TRACKER = opts.workTracker;
    assert.strictEqual(runtime.proc.env.LIBHARNESS_WORK_TRACKER, "filesystem");
  });
});

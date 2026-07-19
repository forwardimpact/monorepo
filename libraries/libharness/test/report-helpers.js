/**
 * Shared setup for the benchmark report suites: a schema-valid happy record
 * plus in-memory-ledger runtime builders. Intentionally a regular module
 * (not a `.test.js` file).
 */

import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

export const INPUT_DIR = "/benchmark-report";

/**
 * A schema-valid happy-branch result record.
 * @param {object} [overrides]
 */
export function baseRecord(overrides) {
  return {
    taskId: "sample",
    runIndex: 0,
    verdict: "pass",
    invariants: { details: [], exitCode: 0 },
    grade: { verdict: "pass", gatesPass: true },
    submission: "x",
    judgeVerdict: { verdict: "pass", summary: "ok" },
    costUsd: 0,
    turns: 1,
    agentTracePath: "/tmp/agent.ndjson",
    supervisorTracePath: "/tmp/supervisor.ndjson",
    judgeTracePath: "/tmp/judge.ndjson",
    profiles: { agent: null, supervisor: null, judge: null },
    model: { agent: "a", supervisor: "s", judge: "j" },
    skillSetHash: "sha256:a",
    familyRevision: "sha256:b",
    durationMs: 100,
    ...overrides,
  };
}

/** Serialize records as a JSONL ledger body. */
export const jsonl = (records) =>
  records.map((r) => JSON.stringify(r)).join("\n") + "\n";

/**
 * Build a runtime whose mock fs holds the given `{path: records[]}` map;
 * `captureStderr` swaps stderr for a collector and returns its buffer.
 * @param {Record<string, object[]>} files
 * @param {{captureStderr?: boolean}} [opts]
 * @returns {{rt: object, errs: string[]}}
 */
export function runtimeWith(files, { captureStderr } = {}) {
  const fsMap = {};
  for (const [path, records] of Object.entries(files))
    fsMap[path] = jsonl(records);
  const errs = [];
  const rt = createTestRuntime({ fs: createMockFs(fsMap) });
  if (captureStderr) rt.proc.stderr = { write: (s) => (errs.push(s), true) };
  return { rt, errs };
}

/**
 * Seed `results.jsonl` for `records` under `INPUT_DIR` and return a runtime;
 * `aggregate` walks `inputDir` and reads the ledger via `runtime.fs`.
 * @param {object[]} records
 */
export function jsonlRuntime(records) {
  return runtimeWith({ [`${INPUT_DIR}/results.jsonl`]: records }).rt;
}

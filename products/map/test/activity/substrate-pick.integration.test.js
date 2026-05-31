/**
 * Tests for `fit-map substrate pick` — verifies single-row envelope
 * shape, exit codes on empty/saturated corpora, and the memory log
 * append/exclude cycle that drives memory diversification.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runPickCommand } from "../../src/commands/substrate-pick.js";
import { makeStub } from "./_substrate-stubs.js";

// Integration test: substrate pick writes wiki/kata-interview/picks.csv on
// real disk, so it threads a real createDefaultRuntime() with a chunk-
// capturing proc surface (so stdout/stderr can be asserted, and reset
// between successive picks within a test).
function makeRuntime() {
  const base = createDefaultRuntime();
  const stdout = { chunks: [], write: (s) => stdout.chunks.push(String(s)) };
  const stderr = { chunks: [], write: (s) => stderr.chunks.push(String(s)) };
  const runtime = {
    ...base,
    proc: { ...base.proc, stdout, stderr },
    _resetStdout: () => {
      stdout.chunks.length = 0;
    },
    outText: () => stdout.chunks.join(""),
    errText: () => stderr.chunks.join(""),
  };
  return runtime;
}

function makeTwoPersonaSeed() {
  return {
    snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
    scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
    teams: [{ getdx_team_id: "T1", name: "Team One" }],
    humans: [
      {
        email: "alice@x",
        name: "Alice",
        github_username: "alice",
        kind: "human",
        discipline: "d",
        level: "L1",
        track: "core",
        manager_email: "chief@x",
        getdx_team_id: "T1",
      },
      {
        email: "dora@x",
        name: "Dora",
        github_username: "dora",
        kind: "human",
        discipline: "d",
        level: "L1",
        track: "core",
        manager_email: "chief@x",
        getdx_team_id: "T1",
      },
      {
        email: "bob@x",
        name: "Bob",
        github_username: "bob",
        kind: "human",
        discipline: "d",
        level: "L1",
        track: null,
        manager_email: "alice@x",
        getdx_team_id: "T1",
      },
      {
        email: "eve@x",
        name: "Eve",
        github_username: "eve",
        kind: "human",
        discipline: "d",
        level: "L1",
        track: null,
        manager_email: "dora@x",
        getdx_team_id: "T1",
      },
      {
        email: "chief@x",
        name: "Chief",
        github_username: "chief",
        kind: "human",
        discipline: "d",
        level: "L9",
        track: null,
        manager_email: null,
        getdx_team_id: null,
      },
    ],
    artifacts: [
      { artifact_id: "ART1", email: "alice@x" },
      { artifact_id: "ART2", email: "bob@x" },
      { artifact_id: "ART3", email: "dora@x" },
      { artifact_id: "ART4", email: "eve@x" },
    ],
    evidence: [
      { artifact_id: "ART1" },
      { artifact_id: "ART2" },
      { artifact_id: "ART3" },
      { artifact_id: "ART4" },
    ],
  };
}

describe("substrate pick", () => {
  let runtime;
  let tmp;
  beforeEach(async () => {
    runtime = makeRuntime();
    tmp = await mkdtemp(path.join(os.tmpdir(), "subpick-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("empty corpus exits non-zero with diagnostic on stderr", async () => {
    const supabase = makeStub({});
    const code = await runPickCommand({
      supabase,
      options: {},
      cwd: tmp,
      runtime,
    });
    assert.notEqual(code, 0);
    assert.match(runtime.errText(), /substrate pick:/);
  });

  test("non-empty corpus, no memory file → one-row envelope and writes picks.csv", async () => {
    const supabase = makeStub(makeTwoPersonaSeed());
    const code = await runPickCommand({
      supabase,
      options: {},
      env: { GITHUB_RUN_ID: "42" },
      cwd: tmp,
      runtime,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(runtime.outText());
    assert.equal(parsed.personas.length, 1);
    assert.equal(parsed.selection_metadata.memory_window, 5);
    const csv = await readFile(
      path.join(tmp, "wiki/kata-interview/picks.csv"),
      "utf8",
    );
    assert.match(csv, /^picked_at,persona_email,run_id\n/);
    assert.match(csv, /,42\n/);
    assert.match(csv, new RegExp(`,${parsed.personas[0].email},`));
  });

  test("successive invocations return different persona_email values", async () => {
    const seed = makeTwoPersonaSeed();
    const supabase1 = makeStub(seed);
    const code1 = await runPickCommand({
      supabase: supabase1,
      options: {},
      cwd: tmp,
      runtime,
    });
    assert.equal(code1, 0);
    const first = JSON.parse(runtime.outText()).personas[0].email;

    runtime._resetStdout();
    const supabase2 = makeStub(seed);
    const code2 = await runPickCommand({
      supabase: supabase2,
      options: {},
      cwd: tmp,
      runtime,
    });
    assert.equal(code2, 0);
    const second = JSON.parse(runtime.outText()).personas[0].email;
    assert.notEqual(first, second);
  });

  test("saturated memory window exits non-zero with diversification diagnostic", async () => {
    const seed = makeTwoPersonaSeed();
    let i = 0;
    let lastCode = 0;
    while (i < 4) {
      runtime._resetStdout();
      const supabase = makeStub(seed);
      lastCode = await runPickCommand({
        supabase,
        options: {},
        cwd: tmp,
        runtime,
      });
      if (lastCode !== 0) break;
      i += 1;
    }
    assert.notEqual(lastCode, 0);
    assert.match(runtime.errText(), /no candidate diversifies/);
  });
});

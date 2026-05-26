/**
 * Tests for `fit-map substrate roster` — verifies JSON output shape,
 * exit codes on non-empty vs. empty corpora, and stderr diagnostic
 * propagation.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { runRosterCommand } from "../../src/commands/substrate-roster.js";
import { makeStub } from "./_substrate-stubs.js";

const supabasePersonaArtifacts = {
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
  ],
  evidence: [{ artifact_id: "ART1" }, { artifact_id: "ART2" }],
};

function captureStdout() {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return true;
  };
  return {
    text: () => chunks.join(""),
    restore: () => {
      process.stdout.write = orig;
    },
  };
}

function captureStderr() {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return true;
  };
  return {
    text: () => chunks.join(""),
    restore: () => {
      process.stderr.write = orig;
    },
  };
}

describe("substrate-roster JSON output", () => {
  let out;
  let err;
  beforeEach(() => {
    out = captureStdout();
    err = captureStderr();
  });
  afterEach(() => {
    out.restore();
    err.restore();
  });

  test("--format json returns { personas, selection_metadata } with per-row discovery", async () => {
    const supabase = makeStub(supabasePersonaArtifacts);
    const code = await runRosterCommand({
      supabase,
      options: { format: "json" },
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(out.text());
    assert.equal(parsed.personas.length, 1);
    const alice = parsed.personas[0];
    assert.equal(alice.email, "alice@x");
    assert.deepEqual(parsed.selection_metadata.signals, [
      "memory_diversification",
      "jtbd_role_alignment",
    ]);
    // snapshot_id/item_id are per-persona-row (consistent with SKILL.md
    // Step 3a). No top-level `discovery` field is exposed.
    assert.equal(alice.snapshot_id, "S1");
    assert.equal(alice.item_id, "ITEM1");
    assert.equal(parsed.discovery, undefined);
    // Operator surface fields.
    assert.equal(alice.parent_email, "chief@x");
    assert.equal(alice.team_name, "Team One");
    assert.equal(alice.parent.email, "chief@x");
    assert.equal(alice.teammates_truncated, false);
    // The seed's getdx_team_id "T1" does not match any DSL team id, so the
    // enricher returns the three DSL fields as null without throwing.
    assert.equal(alice.repos, null);
    assert.equal(alice.department_name, null);
    assert.equal(alice.scenario, null);
  });

  test("non-empty corpus exits 0 with table output", async () => {
    const supabase = makeStub(supabasePersonaArtifacts);
    const code = await runRosterCommand({ supabase, options: {} });
    assert.equal(code, 0);
    const text = out.text();
    // Aligned header line, no leading bullet.
    assert.match(text, /^email\s+name\s+/);
    assert.match(text, /alice@x/);
    assert.equal(text.includes("\u2022"), false);
  });

  test("empty corpus exits non-zero with diagnostic on stderr", async () => {
    const supabase = makeStub({});
    const code = await runRosterCommand({ supabase, options: {} });
    assert.notEqual(code, 0);
    assert.match(err.text(), /substrate roster:/);
  });
});

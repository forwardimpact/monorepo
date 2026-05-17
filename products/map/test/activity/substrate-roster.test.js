/**
 * Tests for `fit-map substrate roster` — verifies JSON output shape,
 * exit codes on non-empty vs. empty corpora, and stderr diagnostic
 * propagation.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { runRosterCommand } from "../../src/commands/substrate-roster.js";

const supabasePersonaArtifacts = {
  snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
  scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
  humans: [
    {
      email: "alice@x",
      name: "Alice",
      kind: "human",
      discipline: "d",
      level: "L1",
      track: "core",
      manager_email: null,
    },
    {
      email: "bob@x",
      name: "Bob",
      kind: "human",
      discipline: "d",
      level: "L1",
      track: null,
      manager_email: "alice@x",
    },
  ],
  artifacts: [
    { artifact_id: "ART1", email: "alice@x" },
    { artifact_id: "ART2", email: "bob@x" },
  ],
  evidence: [{ artifact_id: "ART1" }, { artifact_id: "ART2" }],
};

function makeStub(seed) {
  return {
    from(table) {
      let rows;
      let filter = (rs) => rs;
      switch (table) {
        case "getdx_snapshots":
          rows = seed.snapshots ?? [];
          break;
        case "getdx_snapshot_team_scores":
          rows = seed.scores ?? [];
          break;
        case "organization_people":
          rows = seed.humans ?? [];
          filter = (rs) => rs.filter((r) => r.kind === "human");
          break;
        case "github_artifacts":
          rows = seed.artifacts ?? [];
          break;
        case "evidence":
          rows = seed.evidence ?? [];
          break;
        default:
          throw new Error(`unexpected table ${table}`);
      }
      let filtered = rows;
      const builder = {
        select() {
          filtered = filter(rows);
          return builder;
        },
        eq(col, val) {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: filtered, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: filtered, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    },
  };
}

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
    assert.equal(parsed.personas[0].email, "alice@x");
    assert.deepEqual(parsed.selection_metadata.signals, [
      "memory_diversification",
      "jtbd_role_alignment",
    ]);
    // snapshot_id/item_id are per-persona-row (consistent with SKILL.md
    // Step 3a). No top-level `discovery` field is exposed.
    assert.equal(parsed.personas[0].snapshot_id, "S1");
    assert.equal(parsed.personas[0].item_id, "ITEM1");
    assert.equal(parsed.discovery, undefined);
  });

  test("non-empty corpus exits 0 with text output", async () => {
    const supabase = makeStub(supabasePersonaArtifacts);
    const code = await runRosterCommand({ supabase, options: {} });
    assert.equal(code, 0);
    assert.match(out.text(), /alice@x/);
  });

  test("empty corpus exits non-zero with diagnostic on stderr", async () => {
    const supabase = makeStub({});
    const code = await runRosterCommand({ supabase, options: {} });
    assert.notEqual(code, 0);
    assert.match(err.text(), /substrate roster:/);
  });
});

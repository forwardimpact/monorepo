/**
 * Tests for `findInvariantSatisfyingPersonas` — covers each spec 990
 * § Persona-corpus invariant and the binding-constraint diagnostic.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findInvariantSatisfyingPersonas } from "../../src/commands/substrate-persona-query.js";

/**
 * Build a Supabase-shaped stub with the five tables the helper queries.
 * Each table's stub returns rows; chained calls (select/eq/order/limit)
 * are tolerated as no-ops so the helper's call patterns work.
 */
function makeStub({
  snapshots = [],
  scores = [],
  humans = [],
  artifacts = [],
  evidence = [],
} = {}) {
  return {
    from(table) {
      let rows;
      let filter = (rs) => rs;
      switch (table) {
        case "getdx_snapshots":
          rows = snapshots;
          break;
        case "getdx_snapshot_team_scores":
          rows = scores;
          break;
        case "organization_people":
          rows = humans;
          // helper filters `.eq("kind", "human")`
          filter = (rs) => rs.filter((r) => r.kind === "human");
          break;
        case "github_artifacts":
          rows = artifacts;
          break;
        case "evidence":
          rows = evidence;
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

describe("findInvariantSatisfyingPersonas", () => {
  test("returns empty + diagnostic when no snapshots exist", async () => {
    const supabase = makeStub({});
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 0);
    assert.match(out.diagnostic, /no getdx_snapshots/);
  });

  test("returns empty + diagnostic when no scores for snapshot", async () => {
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 0);
    assert.match(out.diagnostic, /no getdx_snapshot_team_scores/);
  });

  test("returns empty + diagnostic when no human rows", async () => {
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      humans: [],
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 0);
    assert.match(out.diagnostic, /no kind=human/);
  });

  test("filters out humans that fail any invariant; diagnoses binding constraint", async () => {
    // alice manages bob, bob authored evidence → alice passes (a)(b? no — alice no evidence)(c)
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      humans: [
        {
          email: "alice@x",
          name: "A",
          kind: "human",
          discipline: "d",
          level: "L1",
          track: null,
          manager_email: null,
        },
        {
          email: "bob@x",
          name: "B",
          kind: "human",
          discipline: "d",
          level: "L1",
          track: null,
          manager_email: "alice@x",
        },
      ],
      artifacts: [{ artifact_id: "ART1", email: "bob@x" }],
      evidence: [{ artifact_id: "ART1" }],
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    // alice fails (b) — has no evidence row of her own. No persona qualifies.
    assert.equal(out.personas.length, 0);
    assert.match(
      out.diagnostic,
      /no invariant-satisfying persona — binding constraint:/,
    );
  });

  test("returns a persona that satisfies all four invariants", async () => {
    // alice manages bob AND has her own evidence; bob authored evidence
    // (so practice_directs_count >= 1 for alice).
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      humans: [
        {
          email: "alice@x",
          name: "A",
          kind: "human",
          discipline: "d",
          level: "L1",
          track: null,
          manager_email: null,
        },
        {
          email: "bob@x",
          name: "B",
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
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 1);
    assert.equal(out.personas[0].email, "alice@x");
    assert.equal(out.discovery.snapshot_id, "S1");
    assert.equal(out.discovery.item_id, "ITEM1");
    assert.equal(out.personas[0].manages_count, 1);
    assert.equal(out.personas[0].evidence_count, 1);
    assert.equal(out.personas[0].practice_directs_count, 1);
  });

  test("excludes service_account rows from the humans pool", async () => {
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      humans: [
        {
          email: "svc@x",
          name: "Svc",
          kind: "service_account",
          discipline: "d",
          level: "L1",
          track: null,
          manager_email: null,
        },
      ],
      artifacts: [],
      evidence: [],
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 0);
    assert.match(out.diagnostic, /no kind=human/);
  });
});

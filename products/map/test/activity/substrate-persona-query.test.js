/**
 * Tests for `findInvariantSatisfyingPersonas` — covers each persona-corpus
 * invariant and the binding-constraint diagnostic.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findInvariantSatisfyingPersonas } from "../../src/commands/substrate-persona-query.js";
import { makeStub } from "./_substrate-stubs.js";

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
    // (so practice_directs_count >= 1 for alice). The persona's own
    // manager_email must be non-null — chief@x is alice's parent for that
    // join.
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      teams: [{ getdx_team_id: "T1", name: "Team One" }],
      humans: [
        {
          email: "alice@x",
          name: "A",
          github_username: "alice",
          kind: "human",
          discipline: "d",
          level: "L1",
          track: null,
          manager_email: "chief@x",
          getdx_team_id: "T1",
        },
        {
          email: "bob@x",
          name: "B",
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
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 1);
    const alice = out.personas[0];
    assert.equal(alice.email, "alice@x");
    assert.equal(alice.parent_email, "chief@x");
    assert.equal(alice.team_name, "Team One");
    assert.equal(alice.parent.email, "chief@x");
    assert.equal(alice.parent.level, "L9");
    assert.equal(alice.teammates.length, 1);
    assert.equal(alice.teammates[0].email, "bob@x");
    assert.equal(alice.teammates_truncated, false);
    assert.equal(out.discovery.snapshot_id, "S1");
    assert.equal(out.discovery.item_id, "ITEM1");
    assert.equal(alice.manages_count, 1);
    assert.equal(alice.evidence_count, 1);
    assert.equal(alice.practice_directs_count, 1);
  });

  test("excludes top-of-tree rows; diagnoses parent_email_known when all parents are null", async () => {
    const supabase = makeStub({
      snapshots: [{ snapshot_id: "S1", scheduled_for: "2026-01-01" }],
      scores: [{ item_id: "ITEM1", snapshot_id: "S1" }],
      humans: [
        {
          email: "solo@x",
          name: "Solo",
          kind: "human",
          discipline: "d",
          level: "L9",
          track: null,
          manager_email: null,
          getdx_team_id: null,
        },
      ],
      artifacts: [],
      evidence: [],
    });
    const out = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(out.personas.length, 0);
    assert.match(
      out.diagnostic,
      /no invariant-satisfying persona — binding constraint: parent_email_known/,
    );
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

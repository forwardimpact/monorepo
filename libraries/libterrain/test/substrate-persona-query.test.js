/**
 * Persona query against the Substrate Contract: invariant sets with and
 * without `substrate.evidence`, the binding-constraint diagnostic, and
 * discovery folding/absence.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  findInvariantSatisfyingPersonas,
  loadDiscovery,
} from "../src/substrate/persona-query.js";
import {
  makeSubstrateStub,
  invariantSatisfyingSeed,
} from "./substrate-stubs.js";

describe("findInvariantSatisfyingPersonas", () => {
  test("returns the invariant-satisfying persona with both invariant sets", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const result = await findInvariantSatisfyingPersonas({ supabase });

    assert.deepEqual(result.applied_invariants, ["structural", "evidence"]);
    assert.equal(result.personas.length, 1);
    const p = result.personas[0];
    assert.equal(p.email, "mgr@x");
    assert.equal(p.parent_email, "top@x");
    assert.equal(p.team_id, "team-a");
    assert.equal(p.team_name, "Team A");
    assert.equal(p.manages_count, 2);
    assert.equal(p.evidence_count, 1);
    assert.equal(p.practice_directs_count, 1);
    assert.equal(p.teammates_truncated, false);
    // The contract row carries no vendor fields.
    assert.equal("github_username" in p, false);
    assert.equal("getdx_team_id" in p, false);
    assert.equal("snapshot_id" in p, false);
    assert.deepEqual(result.discovery, {
      snapshot_id: "S1",
      item_id: "ITEM1",
    });
  });

  test("drops evidence invariants when substrate.evidence is absent", async () => {
    const seed = invariantSatisfyingSeed();
    seed.evidence = null;
    const supabase = makeSubstrateStub(seed);
    const result = await findInvariantSatisfyingPersonas({ supabase });

    assert.deepEqual(result.applied_invariants, ["structural"]);
    // Structural-only: mgr@x still qualifies (has manager, manages 2).
    const emails = result.personas.map((p) => p.email);
    assert.ok(emails.includes("mgr@x"));
    // dev1@x has a manager but manages nobody — still excluded.
    assert.equal(emails.includes("dev1@x"), false);
    // Evidence counts read 0 without the relation.
    assert.equal(result.personas[0].evidence_count, 0);
  });

  test("empty people yields the empty-roster diagnostic", async () => {
    const supabase = makeSubstrateStub({ people: [] });
    const result = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(result.personas.length, 0);
    assert.match(result.diagnostic, /no kind=human rows/);
  });

  test("diagnoses the binding constraint when no persona qualifies", async () => {
    const seed = invariantSatisfyingSeed();
    // Nobody authors evidence: authors_evidence becomes the binding root.
    seed.evidence = [];
    const supabase = makeSubstrateStub(seed);
    const result = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(result.personas.length, 0);
    assert.match(result.diagnostic, /binding constraint: authors_evidence/);
  });

  test("structural-only binding diagnostic never names evidence constraints", async () => {
    const seed = invariantSatisfyingSeed();
    seed.evidence = null;
    // No human has a manager: parent_email_known is the binding root.
    seed.people = seed.people.map((p) => ({ ...p, manager_email: null }));
    const supabase = makeSubstrateStub(seed);
    const result = await findInvariantSatisfyingPersonas({ supabase });
    assert.equal(result.personas.length, 0);
    assert.match(result.diagnostic, /binding constraint: parent_email_known/);
  });

  test("propagates non-absence errors from substrate.evidence", async () => {
    const seed = invariantSatisfyingSeed();
    const stub = makeSubstrateStub(seed);
    const failing = {
      ...stub,
      from(table) {
        if (table === "evidence") {
          const rejected = Promise.resolve({
            data: null,
            error: { code: "42501", message: "permission denied" },
          });
          return {
            select: () => rejected,
          };
        }
        return stub.from(table);
      },
    };
    await assert.rejects(
      () => findInvariantSatisfyingPersonas({ supabase: failing }),
      /substrate\.evidence: permission denied/,
    );
  });
});

describe("loadDiscovery", () => {
  test("folds key/value rows into one object", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    assert.deepEqual(await loadDiscovery(supabase), {
      snapshot_id: "S1",
      item_id: "ITEM1",
    });
  });

  test("absent relation folds to null", async () => {
    const supabase = makeSubstrateStub({ discovery: null });
    assert.equal(await loadDiscovery(supabase), null);
  });

  test("empty relation folds to null", async () => {
    const supabase = makeSubstrateStub({ discovery: [] });
    assert.equal(await loadDiscovery(supabase), null);
  });
});

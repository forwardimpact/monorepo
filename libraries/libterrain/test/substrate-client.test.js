/**
 * The client factory is the only construction site for substrate Supabase
 * clients, and it must bind `db.schema = "substrate"` — the guard for the
 * `evidence` relation name shared with map's vendor `activity.evidence`
 * table: an unbound client would silently read the wrong relation through
 * the default search path.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSubstrateClient } from "../src/substrate/client.js";

const config = {
  supabaseUrl: () => "http://localhost:54321",
  supabaseServiceRoleKey: () => "service-role-key",
};

describe("createSubstrateClient", () => {
  test("binds the client to the substrate schema", () => {
    const calls = [];
    const createClientFn = (url, key, opts) => {
      calls.push({ url, key, opts });
      return { stub: true };
    };
    const client = createSubstrateClient({ config, createClientFn });
    assert.deepEqual(client, { stub: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:54321");
    assert.equal(calls[0].key, "service-role-key");
    assert.equal(calls[0].opts.db.schema, "substrate");
  });

  test("requires config", () => {
    assert.throws(
      () => createSubstrateClient({ createClientFn: () => ({}) }),
      /config required/,
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createLandmarkClient,
  SupabaseUnavailableError,
  isRelationNotFoundError,
} from "../../src/lib/supabase.js";

function makeConfig({ url = "http://localhost:54321", anonKey = "anon" } = {}) {
  return {
    supabaseUrl: () => {
      if (url === null)
        throw new Error("SUPABASE_URL not found in environment");
      return url;
    },
    supabaseAnonKey: () => {
      if (anonKey === null)
        throw new Error("SUPABASE_ANON_KEY not found in environment");
      return anonKey;
    },
  };
}

describe("createLandmarkClient", () => {
  it("throws SupabaseUnavailableError when config is missing", () => {
    assert.throws(
      () => createLandmarkClient({ jwt: "x" }),
      SupabaseUnavailableError,
    );
  });

  it("throws SupabaseUnavailableError when URL accessor fails", () => {
    assert.throws(
      () =>
        createLandmarkClient({ jwt: "x", config: makeConfig({ url: null }) }),
      /SUPABASE_URL and SUPABASE_ANON_KEY must be set/,
    );
  });

  it("throws SupabaseUnavailableError when anon-key accessor fails", () => {
    assert.throws(
      () =>
        createLandmarkClient({
          jwt: "x",
          config: makeConfig({ anonKey: null }),
        }),
      /SUPABASE_URL and SUPABASE_ANON_KEY must be set/,
    );
  });

  it("throws SupabaseUnavailableError when jwt is missing", () => {
    assert.throws(
      () => createLandmarkClient({ config: makeConfig() }),
      /missing JWT/,
    );
  });

  it("constructs a client when config and jwt are present", () => {
    const client = createLandmarkClient({
      jwt: "header.payload.signature",
      config: makeConfig(),
    });
    assert.ok(client);
    assert.equal(typeof client.from, "function");
    assert.equal(typeof client.rpc, "function");
  });
});

describe("isRelationNotFoundError", () => {
  it("returns true for a 42P01 code", () => {
    assert.equal(isRelationNotFoundError({ code: "42P01" }), true);
  });

  it("returns true when the message contains 42P01", () => {
    assert.equal(
      isRelationNotFoundError({ message: "relation does not exist (42P01)" }),
      true,
    );
  });

  it("returns falsy for unrelated errors", () => {
    assert.ok(!isRelationNotFoundError({ code: "23505" }));
    assert.ok(!isRelationNotFoundError(null));
  });
});

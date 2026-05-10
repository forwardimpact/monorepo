import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createLandmarkClient,
  SupabaseUnavailableError,
  isRelationNotFoundError,
} from "../../src/lib/supabase.js";

describe("createLandmarkClient", () => {
  it("throws SupabaseUnavailableError when url is missing", () => {
    assert.throws(
      () => createLandmarkClient({ jwt: "x", anonKey: "y", url: undefined }),
      SupabaseUnavailableError,
    );
  });

  it("throws SupabaseUnavailableError when anonKey is missing", () => {
    assert.throws(
      () =>
        createLandmarkClient({
          jwt: "x",
          url: "http://localhost:54321",
          anonKey: undefined,
        }),
      SupabaseUnavailableError,
    );
  });

  it("throws SupabaseUnavailableError when jwt is missing", () => {
    assert.throws(
      () =>
        createLandmarkClient({
          url: "http://localhost:54321",
          anonKey: "anon",
        }),
      /missing JWT/,
    );
  });

  it("constructs a client when url, anonKey, and jwt are present", () => {
    const client = createLandmarkClient({
      jwt: "header.payload.signature",
      url: "http://localhost:54321",
      anonKey: "anon-key",
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

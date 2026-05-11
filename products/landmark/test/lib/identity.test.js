import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  IdentityUnresolvedError,
  resolveIdentity,
} from "../../src/lib/identity.js";
import { signTestToken } from "./sign-test-token.js";

const SECRET = "test-secret-do-not-reuse";

function envWith(overrides = {}) {
  return { ...overrides };
}

describe("resolveIdentity", () => {
  it("throws when LANDMARK_AUTH_TOKEN is missing", () => {
    assert.throws(() => resolveIdentity(envWith()), IdentityUnresolvedError);
    try {
      resolveIdentity(envWith());
    } catch (err) {
      assert.equal(err.code, "LANDMARK_IDENTITY_UNRESOLVED");
      assert.match(err.message, /LANDMARK_AUTH_TOKEN is not set/);
    }
  });

  it("throws on a non-JWT shape", () => {
    assert.throws(
      () =>
        resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: "not.a.jwt.really" })),
      /not a JWT/,
    );
  });

  it("throws on a header that does not announce HS256 + JWT", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "alice@example.com",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const sig = "a".repeat(43);
    const bad = `${header}.${payload}.${sig}`;
    assert.throws(
      () => resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: bad })),
      /header rejected/,
    );
  });

  it("throws on malformed JSON payload", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from("not-json").toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    assert.throws(
      () => resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: bad })),
      /payload is not valid JSON/,
    );
  });

  it("throws when email claim is missing", () => {
    const token = signTestToken({ email: "", secret: SECRET });
    // Strip out the email by re-signing with no email at all.
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const noEmail = `${header}.${payload}.${sig}`;
    assert.throws(
      () =>
        resolveIdentity(
          envWith({
            LANDMARK_AUTH_TOKEN: noEmail,
            MAP_SUPABASE_JWT_SECRET: SECRET,
          }),
        ),
      /missing string email claim/,
    );
    // Sanity: signTestToken still produced a token (not the test path).
    assert.ok(token.split(".").length === 3);
  });

  it("throws when email claim is not a string", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: 12345,
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    assert.throws(
      () => resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: bad })),
      /missing string email claim/,
    );
  });

  it("throws when exp claim is not a number", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ email: "a@b", exp: "soon" }),
    ).toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    assert.throws(
      () => resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: bad })),
      /expired/,
    );
  });

  it("throws on expired token", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "alice@example.com",
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const expired = `${header}.${payload}.${sig}`;
    assert.throws(
      () =>
        resolveIdentity(
          envWith({
            LANDMARK_AUTH_TOKEN: expired,
            MAP_SUPABASE_JWT_SECRET: SECRET,
          }),
        ),
      /expired/,
    );
  });

  it("throws on a forged signature when the secret is present", () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const [h, p] = token.split(".");
    const bad = `${h}.${p}.${"a".repeat(43)}`;
    assert.throws(
      () =>
        resolveIdentity(
          envWith({
            LANDMARK_AUTH_TOKEN: bad,
            MAP_SUPABASE_JWT_SECRET: SECRET,
          }),
        ),
      /signature does not verify/,
    );
  });

  it("returns { email, jwt } on a happy path with the secret present", () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const out = resolveIdentity(
      envWith({
        LANDMARK_AUTH_TOKEN: token,
        MAP_SUPABASE_JWT_SECRET: SECRET,
      }),
    );
    assert.equal(out.email, "alice@example.com");
    assert.equal(out.jwt, token);
  });

  it("trusts the JWT shape when the secret is absent (production path)", () => {
    // No MAP_SUPABASE_JWT_SECRET in env — defense-in-depth is skipped.
    const token = signTestToken({ email: "bob@example.com", secret: SECRET });
    const out = resolveIdentity(envWith({ LANDMARK_AUTH_TOKEN: token }));
    assert.equal(out.email, "bob@example.com");
  });
});

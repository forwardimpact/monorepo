import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { signTestToken } from "./sign-test-token.js";

const SECRET = "sign-test-token-secret";

function decode(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("signTestToken", () => {
  it("throws when neither argument nor JWT_SECRET is set", () => {
    const prior = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.throws(
        () => signTestToken({ email: "alice@example.com" }),
        /JWT_SECRET not set/,
      );
    } finally {
      if (prior !== undefined) process.env.JWT_SECRET = prior;
    }
  });

  it("produces a three-part JWT", () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const parts = token.split(".");
    assert.equal(parts.length, 3);
  });

  it("header announces HS256 + JWT", () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const header = decode(token.split(".")[0]);
    assert.equal(header.alg, "HS256");
    assert.equal(header.typ, "JWT");
  });

  it("payload carries Supabase-shaped claims", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signTestToken({
      email: "alice@example.com",
      secret: SECRET,
      ttlSeconds: 60,
    });
    const after = Math.floor(Date.now() / 1000);
    const claims = decode(token.split(".")[1]);
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.aud, "authenticated");
    assert.equal(claims.email, "alice@example.com");
    assert.equal(claims.iss, "supabase");
    assert.ok(claims.iat >= before && claims.iat <= after);
    assert.ok(claims.exp >= claims.iat + 59 && claims.exp <= claims.iat + 61);
    assert.ok(/^[0-9a-f-]{36}$/i.test(claims.sub), "sub should be a UUID");
  });

  it("signature is HMAC-SHA256 over header.payload with the secret", () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const [h, p, s] = token.split(".");
    const expected = createHmac("sha256", SECRET)
      .update(`${h}.${p}`)
      .digest("base64url");
    assert.equal(s, expected);
  });
});

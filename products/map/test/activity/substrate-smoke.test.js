/**
 * Tests for substrate-smoke's pure assertion helpers. The spawn-based
 * iterator is covered by integration in the actual stage run; here we
 * verify the shape/email/exp/role-claim guards and persona kind check.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  assertJwtShape,
  assertPersonaIsHuman,
  assertDiscoveryResolves,
} from "../../src/commands/substrate-smoke.js";

function makeJwt(claims) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

function future() {
  return Math.floor(Date.now() / 1000) + 600;
}

describe("assertJwtShape", () => {
  test("rejects wrong aud", () => {
    const jwt = makeJwt({
      aud: "anon",
      role: "authenticated",
      email: "a@b",
      exp: future(),
    });
    assert.throws(() => assertJwtShape(jwt, "a@b"), /aud != authenticated/);
  });

  test("rejects wrong role", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "anon",
      email: "a@b",
      exp: future(),
    });
    assert.throws(() => assertJwtShape(jwt, "a@b"), /role != authenticated/);
  });

  test("rejects email mismatch", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "wrong@x",
      exp: future(),
    });
    assert.throws(() => assertJwtShape(jwt, "right@x"), /email mismatch/);
  });

  test("rejects expired exp", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "a@b",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    assert.throws(() => assertJwtShape(jwt, "a@b"), /exp claim/);
  });

  test("accepts a well-shaped JWT", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "a@b",
      exp: future(),
    });
    assert.doesNotThrow(() => assertJwtShape(jwt, "a@b"));
  });
});

describe("assertPersonaIsHuman", () => {
  function makeSupabase(row, error = null) {
    return {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: row, error };
          },
        };
      },
    };
  }

  test("rejects kind=service_account", async () => {
    const sb = makeSupabase({ kind: "service_account" });
    await assert.rejects(() => assertPersonaIsHuman(sb, "svc@x"), /not human/);
  });

  test("rejects missing row", async () => {
    const sb = makeSupabase(null);
    await assert.rejects(
      () => assertPersonaIsHuman(sb, "missing@x"),
      /not human/,
    );
  });

  test("rejects on supabase error", async () => {
    const sb = makeSupabase(null, { message: "boom" });
    await assert.rejects(
      () => assertPersonaIsHuman(sb, "x@x"),
      /organization_people: boom/,
    );
  });

  test("accepts kind=human", async () => {
    const sb = makeSupabase({ kind: "human" });
    await assert.doesNotReject(() => assertPersonaIsHuman(sb, "p@x"));
  });
});

describe("assertDiscoveryResolves", () => {
  test("rejects persona missing manager_email", () => {
    assert.throws(
      () =>
        assertDiscoveryResolves(
          { email: "a@x" },
          { snapshot_id: "S", item_id: "I" },
        ),
      /missing email\/manager_email/,
    );
  });

  test("rejects discovery missing snapshot_id", () => {
    assert.throws(
      () =>
        assertDiscoveryResolves(
          { email: "a@x", manager_email: "a@x" },
          { snapshot_id: null, item_id: "I" },
        ),
      /discovery vector incomplete/,
    );
  });

  test("accepts a fully populated persona + discovery", () => {
    assert.doesNotThrow(() =>
      assertDiscoveryResolves(
        { email: "a@x", manager_email: "a@x" },
        { snapshot_id: "S", item_id: "I" },
      ),
    );
  });
});

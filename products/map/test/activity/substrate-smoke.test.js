/**
 * Tests for substrate-smoke's pure assertion helpers and iteration
 * builders. The actual `bunx fit-landmark` spawn loop is covered by
 * integration in the live stage run; here we verify every pure
 * surface the smoke composes from (shape/email/exp/role-claim guards,
 * persona kind check, smoke-list expansion, argv build, row-class
 * non-empty assertion).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  assertDiscoveryResolves,
  assertJwtShape,
  assertNonEmpty,
  assertPersonaIsHuman,
  buildSmokeArgv,
  buildSmokeList,
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
    assert.throws(
      () => assertJwtShape(jwt, "a@b", Date.now()),
      /aud != authenticated/,
    );
  });

  test("rejects wrong role", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "anon",
      email: "a@b",
      exp: future(),
    });
    assert.throws(
      () => assertJwtShape(jwt, "a@b", Date.now()),
      /role != authenticated/,
    );
  });

  test("rejects email mismatch", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "wrong@x",
      exp: future(),
    });
    assert.throws(
      () => assertJwtShape(jwt, "right@x", Date.now()),
      /email mismatch/,
    );
  });

  test("rejects expired exp", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "a@b",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    assert.throws(() => assertJwtShape(jwt, "a@b", Date.now()), /exp claim/);
  });

  test("accepts a well-shaped JWT", () => {
    const jwt = makeJwt({
      aud: "authenticated",
      role: "authenticated",
      email: "a@b",
      exp: future(),
    });
    assert.doesNotThrow(() => assertJwtShape(jwt, "a@b", Date.now()));
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
  test("rejects persona missing parent_email", () => {
    assert.throws(
      () =>
        assertDiscoveryResolves(
          { email: "a@x" },
          { snapshot_id: "S", item_id: "I" },
        ),
      /missing email\/parent_email/,
    );
  });

  test("rejects discovery missing snapshot_id", () => {
    assert.throws(
      () =>
        assertDiscoveryResolves(
          { email: "a@x", parent_email: "a@x" },
          { snapshot_id: null, item_id: "I" },
        ),
      /discovery vector incomplete/,
    );
  });

  test("accepts a fully populated persona + discovery", () => {
    assert.doesNotThrow(() =>
      assertDiscoveryResolves(
        { email: "a@x", parent_email: "a@x" },
        { snapshot_id: "S", item_id: "I" },
      ),
    );
  });
});

describe("buildSmokeList expands manifest to iteration items", () => {
  // A miniature manifest mirroring the real fit-landmark shape.
  const manifest = {
    commands: {
      org: { needsSupabase: true },
      snapshot: { needsSupabase: true },
      evidence: { needsSupabase: true },
      practice: { needsSupabase: true },
      health: { needsSupabase: true },
      marker: { needsSupabase: false },
    },
    subcommandExpansions: {
      org: [
        { command: "org show", smokeOptions: {} },
        { command: "org team", smokeOptions: { manager: "$PERSONA_EMAIL" } },
      ],
      snapshot: [
        { command: "snapshot list", smokeOptions: {} },
        {
          command: "snapshot show",
          smokeOptions: { snapshot: "$SNAPSHOT_ID" },
        },
      ],
    },
    flatSmokeOptions: {
      evidence: { email: "$PERSONA_EMAIL" },
      practice: { manager: "$PERSONA_EMAIL" },
    },
  };

  test("skips needsSupabase=false commands", () => {
    const list = buildSmokeList(manifest);
    assert.equal(
      list.find((i) => i.command === "marker"),
      undefined,
    );
  });

  test("expands subcommand-style entries via SUBCOMMAND_EXPANSIONS", () => {
    const list = buildSmokeList(manifest);
    const orgs = list.filter((i) => i.command.startsWith("org "));
    assert.equal(orgs.length, 2);
    assert.deepEqual(
      orgs.map((i) => i.command),
      ["org show", "org team"],
    );
  });

  test("flat commands carry FLAT_SMOKE_OPTIONS", () => {
    const list = buildSmokeList(manifest);
    const ev = list.find((i) => i.command === "evidence");
    assert.deepEqual(ev.smokeOptions, { email: "$PERSONA_EMAIL" });
  });

  test("flat commands with no smoke options resolve to {}", () => {
    const list = buildSmokeList(manifest);
    const health = list.find((i) => i.command === "health");
    assert.deepEqual(health.smokeOptions, {});
  });
});

describe("buildSmokeArgv substitutes placeholders", () => {
  const persona = {
    email: "alice@x",
    parent_email: "alice@x",
  };
  const discovery = { snapshot_id: "S1", item_id: "ITEM1" };

  test("substitutes $PERSONA_EMAIL into option flags", () => {
    const argv = buildSmokeArgv(
      { command: "evidence", smokeOptions: { email: "$PERSONA_EMAIL" } },
      persona,
      discovery,
    );
    assert.deepEqual(argv, [
      "evidence",
      "--email",
      "alice@x",
      "--format",
      "json",
    ]);
  });

  test("substitutes $SNAPSHOT_ID and $ITEM_ID", () => {
    const trend = buildSmokeArgv(
      { command: "snapshot trend", smokeOptions: { item: "$ITEM_ID" } },
      persona,
      discovery,
    );
    assert.deepEqual(trend, [
      "snapshot",
      "trend",
      "--item",
      "ITEM1",
      "--format",
      "json",
    ]);
    const show = buildSmokeArgv(
      { command: "snapshot show", smokeOptions: { snapshot: "$SNAPSHOT_ID" } },
      persona,
      discovery,
    );
    assert.deepEqual(show, [
      "snapshot",
      "show",
      "--snapshot",
      "S1",
      "--format",
      "json",
    ]);
  });

  test("flat commands with no smoke options still get --format json", () => {
    const argv = buildSmokeArgv(
      { command: "health", smokeOptions: {} },
      persona,
      discovery,
    );
    assert.deepEqual(argv, ["health", "--format", "json"]);
  });
});

describe("assertNonEmpty row-class trigger", () => {
  test("throws on empty array under the named key", () => {
    assert.throws(
      () => assertNonEmpty(JSON.stringify({ team: [] }), "team"),
      /row-class non-empty assertion failed for team/,
    );
  });

  test("throws on missing key", () => {
    assert.throws(
      () => assertNonEmpty(JSON.stringify({ other: [{ x: 1 }] }), "team"),
      /row-class non-empty assertion failed for team/,
    );
  });

  test("throws on empty object", () => {
    assert.throws(
      () => assertNonEmpty(JSON.stringify({ evidence: {} }), "evidence"),
      /row-class non-empty assertion failed for evidence/,
    );
  });

  test("accepts non-empty array", () => {
    assert.doesNotThrow(() =>
      assertNonEmpty(JSON.stringify({ team: [{ email: "a@x" }] }), "team"),
    );
  });

  test("accepts non-empty object (e.g. evidence by skillId)", () => {
    assert.doesNotThrow(() =>
      assertNonEmpty(
        JSON.stringify({ evidence: { task_completion: [{ id: 1 }] } }),
        "evidence",
      ),
    );
  });
});

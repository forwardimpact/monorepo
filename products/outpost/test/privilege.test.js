/**
 * privilege unit tests — the mandatory-level resolver and its disclaim mapping.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import {
  PRIVILEGE_LEVELS,
  resolvePrivilege,
  disclaimFor,
} from "../src/privilege.js";

describe("PRIVILEGE_LEVELS", () => {
  test("is exactly [full, restricted]", () => {
    assert.deepStrictEqual(PRIVILEGE_LEVELS, ["full", "restricted"]);
  });
});

describe("resolvePrivilege", () => {
  test("each declared level resolves to itself", () => {
    assert.strictEqual(resolvePrivilege({ privilege: "full" }), "full");
    assert.strictEqual(
      resolvePrivilege({ privilege: "restricted" }),
      "restricted",
    );
  });

  test("a missing level throws", () => {
    assert.throws(() => resolvePrivilege({}), /invalid privilege/);
  });

  test("an explicit undefined level throws", () => {
    assert.throws(
      () => resolvePrivilege({ privilege: undefined }),
      /invalid privilege/,
    );
  });

  test("a null agent throws", () => {
    assert.throws(() => resolvePrivilege(null), /invalid privilege/);
  });

  test("an unrecognised string throws", () => {
    assert.throws(
      () => resolvePrivilege({ privilege: "elevated" }),
      /invalid privilege/,
    );
  });
});

describe("disclaimFor", () => {
  test("full keeps the inherited responsible process (0)", () => {
    assert.strictEqual(disclaimFor("full"), 0);
  });

  test("restricted self-disclaims (1)", () => {
    assert.strictEqual(disclaimFor("restricted"), 1);
  });
});

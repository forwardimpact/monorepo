/**
 * agent-path unit tests — agent name → state-prefix validation.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import {
  agentNameToStatePrefix,
  UnsafeAgentNameError,
} from "../src/agent-path.js";

describe("agentNameToStatePrefix", () => {
  test("maps a valid hyphenated name to an underscore prefix", () => {
    assert.strictEqual(
      agentNameToStatePrefix("staff-engineer"),
      "staff_engineer",
    );
  });

  test("passes a plain name through unchanged", () => {
    assert.strictEqual(agentNameToStatePrefix("postman"), "postman");
  });

  for (const bad of [
    "../escape",
    "a/b",
    "a\\b",
    "..",
    "~root",
    "with\0nul",
    "",
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => agentNameToStatePrefix(bad), UnsafeAgentNameError);
    });
  }

  test("rejects a non-string name", () => {
    assert.throws(
      () => agentNameToStatePrefix(undefined),
      UnsafeAgentNameError,
    );
  });

  test("UnsafeAgentNameError carries the offending name", () => {
    try {
      agentNameToStatePrefix("../x");
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof UnsafeAgentNameError);
      assert.strictEqual(err.agentName, "../x");
    }
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { STATUS_ID_REGEX, parseStatusRowId } from "../src/status.js";

describe("parseStatusRowId", () => {
  test("parses a master spec id", () => {
    assert.deepEqual(parseStatusRowId("1370"), {
      kind: "spec",
      specId: "1370",
      unit: null,
    });
  });

  test("parses a sub-row id with a unit suffix", () => {
    assert.deepEqual(parseStatusRowId("1370/libutil"), {
      kind: "spec",
      specId: "1370",
      unit: "libutil",
    });
    assert.deepEqual(parseStatusRowId("1370/bin-libraries-01"), {
      kind: "spec",
      specId: "1370",
      unit: "bin-libraries-01",
    });
  });

  test("parses an experiment id with four cells", () => {
    assert.deepEqual(
      parseStatusRowId("exp:1351", [
        "exp:1351",
        "approved",
        "a".repeat(40),
        "#1351",
      ]),
      {
        kind: "experiment",
        issue: "1351",
        state: "approved",
        pin: "a".repeat(40),
        planRef: "#1351",
      },
    );
  });

  test("rejects an experiment id without four cells", () => {
    assert.equal(
      parseStatusRowId("exp:1351", ["exp:1351", "registered", "-"]),
      null,
    );
    assert.equal(parseStatusRowId("exp:1351"), null);
  });

  test("rejects malformed ids", () => {
    for (const bad of [
      "137",
      "13700",
      "1370/",
      "1370/UPPER",
      "1370/under_score",
      "abcd",
      "exp:",
      "",
      undefined,
      null,
    ]) {
      assert.equal(parseStatusRowId(bad), null, `expected null for ${bad}`);
    }
  });
});

describe("STATUS_ID_REGEX", () => {
  test("accepts master ids and lowercase-kebab sub-rows", () => {
    assert.ok(STATUS_ID_REGEX.test("0010"));
    assert.ok(STATUS_ID_REGEX.test("1370/libwiki"));
    assert.ok(STATUS_ID_REGEX.test("1370/foundations"));
  });

  test("accepts experiment ids", () => {
    assert.ok(STATUS_ID_REGEX.test("exp:1351"));
    assert.ok(STATUS_ID_REGEX.test("exp:1"));
  });

  test("rejects uppercase, underscores, and short ids", () => {
    assert.ok(!STATUS_ID_REGEX.test("1370/Lib"));
    assert.ok(!STATUS_ID_REGEX.test("1370/lib_wiki"));
    assert.ok(!STATUS_ID_REGEX.test("13"));
    assert.ok(!STATUS_ID_REGEX.test("exp:"));
    assert.ok(!STATUS_ID_REGEX.test("exp:abc"));
  });
});

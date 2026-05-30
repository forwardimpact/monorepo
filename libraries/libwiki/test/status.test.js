import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { STATUS_ID_REGEX, parseStatusRowId } from "../src/status.js";

describe("parseStatusRowId", () => {
  test("parses a master spec id", () => {
    assert.deepEqual(parseStatusRowId("1370"), { specId: "1370", unit: null });
  });

  test("parses a sub-row id with a unit suffix", () => {
    assert.deepEqual(parseStatusRowId("1370/libutil"), {
      specId: "1370",
      unit: "libutil",
    });
    assert.deepEqual(parseStatusRowId("1370/bin-libraries-01"), {
      specId: "1370",
      unit: "bin-libraries-01",
    });
  });

  test("rejects malformed ids", () => {
    for (const bad of [
      "137",
      "13700",
      "1370/",
      "1370/UPPER",
      "1370/under_score",
      "abcd",
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

  test("rejects uppercase, underscores, and short ids", () => {
    assert.ok(!STATUS_ID_REGEX.test("1370/Lib"));
    assert.ok(!STATUS_ID_REGEX.test("1370/lib_wiki"));
    assert.ok(!STATUS_ID_REGEX.test("13"));
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeCrossingField, sanitizeTitle } from "../src/sanitize.js";

describe("sanitizeCrossingField", () => {
  test("returns empty string for null/undefined", () => {
    assert.equal(sanitizeCrossingField(null), "");
    assert.equal(sanitizeCrossingField(undefined), "");
  });

  test("collapses newlines and control characters to single spaces", () => {
    assert.equal(
      sanitizeCrossingField("line one\nline\ttwo\r\nthree"),
      "line one line two three",
    );
  });

  test("preserves hyphens in identifiers", () => {
    assert.equal(sanitizeCrossingField("staff-engineer"), "staff-engineer");
    assert.equal(sanitizeCrossingField("dick-olsson"), "dick-olsson");
  });

  test("escapes a leading protocol sigil so it renders inert", () => {
    assert.equal(sanitizeCrossingField("[ask#1] do it"), "\\[ask#1] do it");
    assert.equal(
      sanitizeCrossingField("<!-- /agent-experiments -->"),
      "\\<!-- /agent-experiments -->",
    );
  });

  test("length-caps with an ellipsis", () => {
    const out = sanitizeCrossingField("x".repeat(300), 10);
    assert.equal(out.length, 10);
    assert.ok(out.endsWith("…"));
  });
});

describe("sanitizeTitle", () => {
  test("defuses an embedded ' (by ' token", () => {
    const out = sanitizeTitle("fix bug (by hand) then ship");
    assert.ok(!out.includes(" (by "), "raw ' (by ' token must not survive");
    // sanitizeTitle inserts a zero-width space (U+200B) after '(by'.
    assert.ok(out.includes(`(by\u200b `));
  });

  test("leaves a title without the token unchanged apart from base sanitize", () => {
    assert.equal(sanitizeTitle("plain title"), "plain title");
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { format } from "prettier";
import { ContentFormatter } from "../src/format.js";

function makeLogger() {
  return { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
}

// JSON.stringify(…, 2) deliberately keeps short arrays multi-line and emits no
// trailing newline; Prettier collapses such arrays and adds the newline. The
// gap is what lets the assertions below prove whether a pass actually ran.
const CANONICAL_JSON = JSON.stringify({ ok: true, tags: ["a", "b"] }, null, 2);

describe("ContentFormatter", () => {
  test("formats every known parser when no skip set is given", async () => {
    const formatter = new ContentFormatter(format, makeLogger());
    const out = await formatter.format(
      new Map([
        ["x.html", "<!doctype html><html><body><p>hi</p></body></html>"],
        ["x.json", CANONICAL_JSON],
      ]),
    );
    assert.ok(
      out.get("x.html").split("\n").length > 2,
      "html should be reflowed across lines",
    );
    assert.notStrictEqual(
      out.get("x.json"),
      CANONICAL_JSON,
      "json should be touched by Prettier when not skipped",
    );
  });

  test("passes skipped parsers through byte-identical", async () => {
    const formatter = new ContentFormatter(format, makeLogger());
    const yaml = "roster:\n  - id: p1\n";
    const out = await formatter.format(
      new Map([
        ["x.json", CANONICAL_JSON],
        ["x.yaml", yaml],
        ["x.html", "<!doctype html><html><body><p>hi</p></body></html>"],
      ]),
      { skipParsers: new Set(["json", "yaml"]) },
    );

    // Canonical machine output is written through untouched...
    assert.strictEqual(out.get("x.json"), CANONICAL_JSON);
    assert.strictEqual(out.get("x.yaml"), yaml);
    // ...while content that genuinely needs reflowing is still formatted.
    assert.ok(out.get("x.html").split("\n").length > 2);
  });

  test("leaves unknown extensions unchanged regardless of skip set", async () => {
    const formatter = new ContentFormatter(format, makeLogger());
    const out = await formatter.format(new Map([["q.sql", "SELECT 1"]]));
    assert.strictEqual(out.get("q.sql"), "SELECT 1");
  });
});

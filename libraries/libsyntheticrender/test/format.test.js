import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { format } from "prettier";
import { ContentFormatter } from "../src/format.js";

function makeLogger() {
  return { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
}

// JSON.stringify(…, 2) deliberately keeps short arrays multi-line. It emits
// no trailing newline. Prettier collapses such arrays and adds the newline.
// The gap lets the assertions below prove whether a pass ran.
const CANONICAL_JSON = JSON.stringify({ ok: true, tags: ["a", "b"] }, null, 2);

describe("ContentFormatter", () => {
  test("formats every known parser when the caller gives no skip set", async () => {
    const formatter = new ContentFormatter(format, makeLogger());
    const out = await formatter.format(
      new Map([
        ["x.html", "<!doctype html><html><body><p>hi</p></body></html>"],
        ["x.json", CANONICAL_JSON],
      ]),
    );
    assert.ok(
      out.get("x.html").split("\n").length > 2,
      "Prettier should reflow html across lines",
    );
    assert.notStrictEqual(
      out.get("x.json"),
      CANONICAL_JSON,
      "Prettier should touch json when the skip set omits it",
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

    // The formatter writes canonical machine output through untouched...
    assert.strictEqual(out.get("x.json"), CANONICAL_JSON);
    assert.strictEqual(out.get("x.yaml"), yaml);
    // ...while it still formats content that genuinely needs a reflow.
    assert.ok(out.get("x.html").split("\n").length > 2);
  });

  test("leaves unknown extensions unchanged regardless of skip set", async () => {
    const formatter = new ContentFormatter(format, makeLogger());
    const out = await formatter.format(new Map([["q.sql", "SELECT 1"]]));
    assert.strictEqual(out.get("q.sql"), "SELECT 1");
  });
});

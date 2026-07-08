/**
 * Pins the fit-map CLI surface after the substrate identity verbs moved to
 * `fit-terrain substrate`: the definition lists none of the four moved
 * verbs, keeps `substrate stage`, and the substrate dispatcher knows only
 * `stage`. Shape test over the bin sources — `bin/fit-map.js` runs `main()`
 * at import, so the definition cannot be imported directly.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "../bin");

async function read(name) {
  return fs.readFile(path.join(BIN, name), "utf8");
}

describe("fit-map CLI definition", () => {
  test("lists none of the moved substrate identity verbs", async () => {
    const source = await read("fit-map.js");
    assert.doesNotMatch(source, /"substrate roster"/);
    assert.doesNotMatch(source, /"substrate pick"/);
    assert.doesNotMatch(source, /"substrate issue"/);
  });

  test("people command offers validate|push only — no provision", async () => {
    const source = await read("fit-map.js");
    assert.match(source, /<validate\|push> \[file\]/);
    assert.doesNotMatch(source, /people-provision/);
    assert.doesNotMatch(source, /case "provision"/);
  });

  test("substrate stage survives with its options", async () => {
    const source = await read("fit-map.js");
    assert.match(source, /"substrate stage"/);
    assert.match(source, /emit-env/);
  });

  test("the substrate dispatcher knows only stage", async () => {
    const source = await read("dispatch-substrate.js");
    assert.match(source, /new Set\(\["stage"\]\)/);
    assert.doesNotMatch(source, /case "(roster|pick|issue)"/);
  });
});

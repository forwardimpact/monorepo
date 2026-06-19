import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { ensureMetricsCsvMergeAttribute } from "../src/gitattributes.js";

const WIKI = "/wiki";
const ATTR = "metrics/**/*.csv merge=union";
const FILE = `${WIKI}/.gitattributes`;

describe("ensureMetricsCsvMergeAttribute", () => {
  test("creates .gitattributes with the line when absent", () => {
    const fs = createMockFs({ [`${WIKI}/README.md`]: "# Wiki\n" });
    const result = ensureMetricsCsvMergeAttribute(WIKI, fs);
    assert.equal(result.changed, true);
    assert.equal(fs.data.get(FILE), `${ATTR}\n`);
  });

  test("is a no-op when the line is already present", () => {
    const original = `${ATTR}\n`;
    const fs = createMockFs({ [FILE]: original });
    const result = ensureMetricsCsvMergeAttribute(WIKI, fs);
    assert.equal(result.changed, false);
    assert.equal(fs.data.get(FILE), original, "bytes unchanged");
  });

  test("appends the line, preserving unrelated existing lines", () => {
    const existing = "*.png binary\nproducts/x/* text eol=lf\n";
    const fs = createMockFs({ [FILE]: existing });
    const result = ensureMetricsCsvMergeAttribute(WIKI, fs);
    assert.equal(result.changed, true);
    assert.equal(fs.data.get(FILE), `${existing}${ATTR}\n`);
  });

  test("adds a missing trailing newline before appending", () => {
    const fs = createMockFs({ [FILE]: "*.png binary" });
    ensureMetricsCsvMergeAttribute(WIKI, fs);
    assert.equal(fs.data.get(FILE), `*.png binary\n${ATTR}\n`);
  });
});

/**
 * Documentation assertion: `products/CLAUDE.md` records the "workspace
 * imports declare dependencies" rule. It also references the contributor-side
 * guard by name (`workspace-imports`).
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

describe("products/CLAUDE.md documents the workspace imports rule", () => {
  const doc = readFileSync(resolve(ROOT, "products/CLAUDE.md"), "utf8");

  test("states that a product must declare each @forwardimpact/* import in its package.json", () => {
    assert.match(
      doc,
      /@forwardimpact\/\*/,
      "products/CLAUDE.md must mention the @forwardimpact/* workspace prefix",
    );
    assert.match(
      doc,
      /package\.json/,
      "products/CLAUDE.md must reference package.json as the declaration site",
    );
    assert.match(
      doc,
      /must\s+(appear|be\s+declared)/i,
      "products/CLAUDE.md must state that the import must appear in package.json",
    );
  });

  test("references the workspace-imports guard by name", () => {
    assert.match(
      doc,
      /workspace-imports/,
      "products/CLAUDE.md must name the guard so a reader who hits its diagnostic can find the rule",
    );
  });
});

/**
 * Shape assertion for the kata-interview SKILL.md. Guards:
 *   - Step 3 staging table carries a substrate-backed-products row.
 *   - Step 3a persona-pick names the substrate verbs the reframe
 *     invokes (`substrate pick` + `substrate issue`).
 *   - The read-do-checklist line carries the amended wording (the
 *     literal "No product names anywhere agent-visible" must be gone, so
 *     production CLI env vars stay permitted).
 *   - Step 4 CLAUDE.md exclusion list is unchanged.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, "..", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");
// Prose is reflowed to 80 columns, so a guarded phrase may wrap across lines.
// Match phrase content against a whitespace-collapsed copy; layout is not the
// thing under test here.
const skillFlat = skill.replace(/\s+/g, " ");

describe("kata-interview SKILL.md amendments", () => {
  it("Step 3 staging table carries a substrate-backed row", () => {
    assert.match(skill, /\| Substrate-backed\s+\|.*substrate.*\|/);
  });

  it("Step 3a persona-pick names the substrate verbs", () => {
    assert.match(skillFlat, /fit-map substrate pick/);
    assert.match(skillFlat, /fit-map substrate issue/);
  });

  it("read-do checklist line is amended verbatim", () => {
    assert.doesNotMatch(skillFlat, /No product names anywhere agent-visible/);
    assert.match(
      skillFlat,
      /product-named environment variables required by the production CLI are permitted in the agent's environment/,
    );
  });

  it("Step 4 CLAUDE.md exclusion list is unchanged", () => {
    assert.match(
      skillFlat,
      /Excluded: goal sentence, Big Hire, Little Hire, Fired-When, product name/,
    );
  });
});

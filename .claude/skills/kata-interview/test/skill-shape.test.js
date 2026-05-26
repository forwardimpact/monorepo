/**
 * Shape assertion for the kata-interview SKILL.md. Guards:
 *   - Step 3 staging table mentions substrate on the Landmark row.
 *   - Step 3a (Landmark persona pick) names the substrate verbs the
 *     persona-pick reframe invokes (`substrate pick` + `substrate issue`).
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

describe("kata-interview SKILL.md amendments", () => {
  it("Step 3 staging table Landmark row mentions substrate", () => {
    assert.match(skill, /\| Landmark\s+\|.*substrate.*staged.*\|/);
  });

  it("Step 3a (Landmark persona pick) names the substrate verbs", () => {
    assert.match(skill, /fit-map substrate pick/);
    assert.match(skill, /fit-map substrate issue/);
  });

  it("read-do checklist line is amended verbatim", () => {
    assert.doesNotMatch(skill, /No product names anywhere agent-visible/);
    assert.match(
      skill,
      /product-named environment variables required by the production CLI are permitted in the agent's environment/,
    );
  });

  it("Step 4 CLAUDE.md exclusion list is unchanged", () => {
    assert.match(
      skill,
      /Excluded: goal sentence, Big Hire, Little Hire, Fired-When, product name/,
    );
  });
});

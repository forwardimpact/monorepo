/**
 * Shape assertion for the kata-interview SKILL.md. Guards:
 *   - Step 3 keeps the substrate-backed staging contract (the workflow's
 *     substrate-setup step owns the substrate; the skill stages none).
 *   - Step 3a persona selection is driven by the injected
 *     `PERSONA_SELECT_COMMAND` (no hardcoded `fit-map` verbs) and reads the
 *     entry point from `WEBSITE_URL`.
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
  it("Step 3 keeps the substrate-backed staging contract", () => {
    assert.match(
      skillFlat,
      /substrate-backed products the workflow's substrate-setup step brings the substrate up/,
    );
    assert.match(skillFlat, /stages no substrate itself/);
  });

  it("Step 3a persona selection is driven by PERSONA_SELECT_COMMAND", () => {
    // The reframe drops hardcoded fit-map verbs in favour of the injected
    // command contract, so the skill stays generic across substrates.
    assert.doesNotMatch(skillFlat, /fit-map substrate pick/);
    assert.doesNotMatch(skillFlat, /fit-map substrate issue/);
    assert.match(skillFlat, /PERSONA_SELECT_COMMAND/);
  });

  it("Step 5 reads the entry point from WEBSITE_URL", () => {
    assert.match(skillFlat, /WEBSITE_URL/);
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

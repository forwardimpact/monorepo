import { test, describe } from "node:test";
import assert from "node:assert";

import { formatJobDescription } from "../src/formatters/job/description.js";

// Minimal template that renders only the capability skill sections, enough to
// assert which proficiency levels reach the job description.
const TEMPLATE = [
  "{{#capabilitySkills}}",
  "## {{capabilityHeading}}",
  "{{#skills}}- {{skillName}}",
  "{{/skills}}",
  "{{/capabilitySkills}}",
].join("\n");

const LEVEL = { id: "J070", typicalExperienceRange: "8+ years" };

/**
 * Build a job with capabilities spread across three descending proficiencies.
 * @returns {Object}
 */
function makeJob() {
  return {
    title: "Test Role",
    expectations: {},
    behaviourProfile: [],
    derivedResponsibilities: [
      {
        capability: "lead",
        capabilityName: "Leadership",
        responsibility: "Lead",
        proficiency: "expert",
      },
      {
        capability: "people",
        capabilityName: "People",
        responsibility: "Grow people",
        proficiency: "practitioner",
      },
      {
        capability: "delivery",
        capabilityName: "Delivery",
        responsibility: "Deliver",
        proficiency: "working",
      },
    ],
    skillMatrix: [
      { capability: "lead", proficiency: "expert", skillName: "Vision Setting" },
      { capability: "people", proficiency: "practitioner", skillName: "Coaching" },
      { capability: "delivery", proficiency: "working", skillName: "Planning" },
    ],
  };
}

/**
 * Render a job description for a discipline.
 * @param {Object} discipline
 * @returns {string}
 */
function render(discipline) {
  return formatJobDescription(
    { job: makeJob(), discipline, level: LEVEL, track: null },
    TEMPLATE,
  );
}

describe("formatJobDescription capability skills", () => {
  const baseDiscipline = {
    roleTitle: "Engineer",
    specialization: "Software",
    description: "Builds software.",
  };

  test("individual-contributor jobs show only the top proficiency level", () => {
    const output = render({ ...baseDiscipline, isManagement: false });
    assert.ok(output.includes("Vision Setting"));
    assert.ok(!output.includes("Coaching"));
    assert.ok(!output.includes("Planning"));
  });

  test("management jobs show the top two proficiency levels", () => {
    const output = render({ ...baseDiscipline, isManagement: true });
    assert.ok(output.includes("Vision Setting"));
    assert.ok(output.includes("Coaching"));
    // The third level stays out so descriptions do not run long.
    assert.ok(!output.includes("Planning"));
  });
});

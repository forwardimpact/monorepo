import { test, describe } from "node:test";
import assert from "node:assert";

import { jobToMarkdown } from "../src/formatters/job/markdown.js";
import { formatJobDescription } from "../src/formatters/job/description.js";

function makeView({ trackName = null } = {}) {
  return {
    title: "Software Engineer",
    disciplineName: "Software Engineering",
    levelId: "J060",
    trackName,
    expectations: {},
    behaviourProfile: [],
    skillMatrix: [],
    driverCoverage: [],
  };
}

describe("jobToMarkdown subtitle", () => {
  test("omits trailing × when trackName is null", () => {
    const out = jobToMarkdown(makeView({ trackName: null }));
    assert.ok(out.includes("Software Engineering × J060"));
    assert.ok(!out.includes("× null"));
    assert.ok(!out.includes("J060 ×\n"));
  });

  test("includes trackName when present", () => {
    const out = jobToMarkdown(makeView({ trackName: "Platform" }));
    assert.ok(out.includes("Software Engineering × J060 × Platform"));
  });
});

describe("formatJobDescription impactScope sentence", () => {
  const template = "{{expectationsParagraph}}";
  const baseArgs = {
    job: {
      title: "Software Engineer",
      skillMatrix: [],
      behaviourProfile: [],
      derivedResponsibilities: [],
    },
    discipline: {
      roleTitle: "Software Engineer",
      specialization: "code",
      roleSummary: "A {roleTitle} working on {specialization}.",
    },
    level: { id: "J060", qualificationSummary: null },
    track: null,
  };

  test("does not double the period when impactScope ends with one", () => {
    const out = formatJobDescription(
      {
        ...baseArgs,
        job: {
          ...baseArgs.job,
          expectations: {
            impactScope: "Defined work streams within larger projects.",
          },
        },
      },
      template,
    );
    assert.ok(!out.includes(".."), `expected no '..' in: ${out}`);
    assert.ok(out.endsWith("."));
  });

  test("adds a period when impactScope omits one", () => {
    const out = formatJobDescription(
      {
        ...baseArgs,
        job: {
          ...baseArgs.job,
          expectations: { impactScope: "Individual tasks with guidance" },
        },
      },
      template,
    );
    assert.ok(out.endsWith("."));
    assert.ok(!out.includes(".."));
  });
});

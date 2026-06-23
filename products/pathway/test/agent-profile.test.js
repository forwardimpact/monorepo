import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { formatAgentProfile } from "../src/formatters/agent/profile.js";

const template = readFileSync(
  fileURLToPath(new URL("../templates/agent.template.md", import.meta.url)),
  "utf-8",
);

/**
 * Build a minimal profile input as produced by buildProfileBodyData.
 * @param {Object} bodyOverrides - Fields to override on bodyData
 * @returns {Object}
 */
function makeProfile(bodyOverrides = {}) {
  return {
    frontmatter: {
      name: "software-engineer--forward-deployed",
      description: "Software Engineering (Forward Deployed).",
      model: "opus",
      skills: ["full-stack-development"],
    },
    bodyData: {
      title: "Software Engineering - Forward Deployed",
      identity: "You are a Forward Deployed Software Engineer.",
      priority: null,
      skillIndex: [
        {
          name: "Full-Stack Development",
          dirname: "full-stack-development",
          useWhen:
            "asked to implement features spanning frontend, backend,\nand infrastructure layers.",
        },
      ],
      roleContext: "",
      workingStyles: [
        {
          title: "Investigate before acting",
          content:
            "Before taking action:\n1. Confirm the goal\n2. Identify unknowns\n3. Research unfamiliar areas",
        },
      ],
      disciplineConstraints: ["Document trade-offs explicitly"],
      trackConstraints: ["document trade-offs explicitly", "Own the outcome"],
      ...bodyOverrides,
    },
  };
}

describe("formatAgentProfile", () => {
  test("renders each working style as a single-line bullet without numbered scaffolding", () => {
    const out = formatAgentProfile(makeProfile(), template);
    assert.ok(
      out.includes(
        "- **Investigate before acting** — Confirm the goal; identify unknowns; research unfamiliar areas",
      ),
      out,
    );
    assert.ok(!out.includes("Before taking action:"));
    assert.ok(!/\n1\. /.test(out));
  });

  test("renders each skill on a single physical table row", () => {
    const out = formatAgentProfile(makeProfile(), template);
    assert.ok(
      out.includes(
        "| Full-Stack Development | asked to implement features spanning frontend, backend, and infrastructure layers. |",
      ),
      out,
    );
  });

  test("de-duplicates a constraint shared by discipline and track", () => {
    const out = formatAgentProfile(makeProfile(), template);
    const occurrences = out.split("Document trade-offs explicitly").length - 1;
    assert.strictEqual(occurrences, 1);
    assert.ok(out.includes("- Own the outcome"));
  });
});

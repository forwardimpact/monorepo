import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { generateSkillMarkdown } from "../src/agent.js";

/**
 * The agent skill name (SKILL.md frontmatter `name` and its directory) is
 * derived from `skill.id` — `skill.agent.name` was removed. These tests lock
 * that contract and the fail-fast guards so an empty `name:` can never ship.
 */

function skill(overrides = {}) {
  return {
    id: "task-completion",
    name: "Task Completion",
    capability: "delivery",
    agent: {
      description: "Guide for completing work items.",
      useWhen: "implementing features",
      focus: "Implement with tests.",
      readChecklist: ["Read the requirements"],
      confirmChecklist: ["Tests pass"],
    },
    ...overrides,
  };
}

describe("generateSkillMarkdown", () => {
  test("frontmatter.name and dirname come from skill.id", () => {
    const md = generateSkillMarkdown({ skillData: skill() });
    assert.equal(md.frontmatter.name, "task-completion");
    assert.equal(md.dirname, "task-completion");
  });

  test("frontmatter.name equals dirname (Claude Code requires the match)", () => {
    const md = generateSkillMarkdown({
      skillData: skill({ id: "code-review" }),
    });
    assert.equal(md.frontmatter.name, md.dirname);
    assert.equal(md.frontmatter.name, "code-review");
  });

  test("title uses the human-readable skill.name, not the id", () => {
    const md = generateSkillMarkdown({ skillData: skill() });
    assert.equal(md.title, "Task Completion");
  });

  test("throws when the agent section is missing", () => {
    assert.throws(
      () => generateSkillMarkdown({ skillData: skill({ agent: undefined }) }),
      /no agent section/,
    );
  });

  test("throws when id is missing — never emits an empty name", () => {
    assert.throws(
      () => generateSkillMarkdown({ skillData: skill({ id: undefined }) }),
      /has no id/,
    );
  });
});

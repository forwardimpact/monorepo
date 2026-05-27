import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runPracticeCommand } from "../src/commands/practice.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { PATTERNS } from "./fixtures.js";

function stubQueries({ patterns = PATTERNS } = {}) {
  return createMockQueries({ getPracticePatterns: patterns });
}

describe("practice command", () => {
  it("returns practice patterns", async () => {
    const result = await runPracticeCommand({
      options: {},
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.equal(result.view.patterns.length, 2);
    assert.equal(result.view.patterns[0].matched, 5);
  });

  it("passes skill filter", async () => {
    let captured;
    const result = await runPracticeCommand({
      options: { skill: "planning", manager: "alice@example.com" },
      supabase: {},
      format: "text",
      queries: {
        getPracticePatterns: async (_sb, opts) => {
          captured = opts;
          return PATTERNS;
        },
      },
    });
    assert.equal(captured.skillId, "planning");
    assert.equal(captured.managerEmail, "alice@example.com");
    assert.ok(result.view);
  });

  it("returns NO_EVIDENCE when empty", async () => {
    const result = await runPracticeCommand({
      options: {},
      supabase: {},
      format: "text",
      queries: stubQueries({ patterns: [] }),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_EVIDENCE);
  });
});

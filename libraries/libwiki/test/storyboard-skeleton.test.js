import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderStoryboardSkeleton } from "../src/storyboard-skeleton.js";
import { scanMarkers } from "../src/marker-scanner.js";

describe("renderStoryboardSkeleton", () => {
  test("heading names the year and month", () => {
    assert.match(
      renderStoryboardSkeleton("2026-07-04"),
      /^# Storyboard — 2026 July$/m,
    );
    assert.match(
      renderStoryboardSkeleton("2026-01-31"),
      /^# Storyboard — 2026 January$/m,
    );
    assert.match(
      renderStoryboardSkeleton("2026-12-01"),
      /^# Storyboard — 2026 December$/m,
    );
  });

  test("Due date is the last day of the month", () => {
    assert.match(
      renderStoryboardSkeleton("2026-07-04"),
      /^\*\*Due:\*\* 2026-07-31$/m,
    );
    assert.match(
      renderStoryboardSkeleton("2026-02-10"),
      /^\*\*Due:\*\* 2026-02-28$/m,
    );
    assert.match(
      renderStoryboardSkeleton("2028-02-10"),
      /^\*\*Due:\*\* 2028-02-29$/m,
    );
  });

  test("carries the five Toyota Kata sections", () => {
    const text = renderStoryboardSkeleton("2026-07-04");
    for (const heading of [
      "## Challenge",
      "## Target Condition",
      "## Current Condition",
      "## Obstacles",
      "## Experiments",
    ]) {
      assert.match(text, new RegExp(`^${heading}$`, "m"));
    }
  });

  test("renders one H3 per roster entry, in roster order, under Current Condition", () => {
    const text = renderStoryboardSkeleton("2026-07-04", [
      "staff-engineer",
      "improvement-coach",
      "technical-writer",
    ]);
    const h3s = text.split("\n").filter((l) => l.startsWith("### "));
    assert.deepEqual(h3s, [
      "### Headlines",
      "### staff-engineer",
      "### improvement-coach",
      "### technical-writer",
      "### Active",
      "### Concluded (last 7 days)",
      "### Active",
      "### Concluded (last 7 days)",
    ]);
    const current = text.indexOf("## Current Condition");
    const obstacles = text.indexOf("## Obstacles");
    for (const agent of ["staff-engineer", "technical-writer"]) {
      const at = text.indexOf(`### ${agent}`);
      assert.ok(
        at > current && at < obstacles,
        `${agent} under Current Condition`,
      );
    }
  });

  test("an empty roster renders no agent section", () => {
    const text = renderStoryboardSkeleton("2026-07-04");
    assert.doesNotMatch(text, /^### (?!Headlines|Active|Concluded)/m);
    assert.equal(text, renderStoryboardSkeleton("2026-07-04", []));
  });

  test("the placeholders name no agent", () => {
    const text = renderStoryboardSkeleton("2026-07-04");
    assert.doesNotMatch(text, /product-manager/);
    assert.match(text, /^> \[Set in the planning meeting\.\]$/m);
  });

  test("emits four balanced, scannable issue-list markers and no xmr blocks", () => {
    const blocks = scanMarkers(renderStoryboardSkeleton("2026-07-04"), {
      warn: (m) => assert.fail(`dangling marker: ${m}`),
    });
    assert.equal(blocks.length, 4);
    assert.deepEqual(blocks.map((b) => `${b.topic}:${b.state}`).sort(), [
      "experiments:closed",
      "experiments:open",
      "obstacles:closed",
      "obstacles:open",
    ]);
    assert.ok(blocks.every((b) => b.kind === "issue-list"));
  });
});

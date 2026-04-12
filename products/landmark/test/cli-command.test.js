import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatResult } from "../src/formatters/index.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

describe("formatResult", () => {
  it("renders empty state in text format", () => {
    const result = {
      view: null,
      meta: { format: "text", emptyState: EMPTY_STATES.NO_SNAPSHOTS },
    };
    const output = formatResult("snapshot", result);
    assert.ok(output.includes("GetDX"));
  });

  it("renders empty state in JSON format", () => {
    const result = {
      view: null,
      meta: { format: "json", emptyState: EMPTY_STATES.NO_SNAPSHOTS },
    };
    const output = formatResult("snapshot", result);
    const parsed = JSON.parse(output);
    assert.equal(parsed.view, null);
    assert.ok(parsed.emptyState.includes("GetDX"));
  });

  it("renders org view in text format", () => {
    const result = {
      view: {
        people: [
          { email: "a@b.com", name: "Alice", discipline: "se", level: "J040" },
        ],
      },
      meta: { format: "text" },
    };
    const output = formatResult("org", result);
    assert.ok(output.includes("Alice"));
    assert.ok(output.includes("a@b.com"));
  });

  it("renders marker view in text format", () => {
    const result = {
      view: {
        skill: "task_completion",
        name: "Task Completion",
        markers: {
          working: {
            human: ["Delivered a feature end-to-end"],
            agent: ["Completed a multi-file change"],
          },
        },
      },
      meta: { format: "text" },
    };
    const output = formatResult("marker", result);
    assert.ok(output.includes("Task Completion"));
    assert.ok(output.includes("working"));
    assert.ok(output.includes("Delivered a feature"));
  });

  it("renders snapshot list in text format", () => {
    const result = {
      view: {
        snapshots: [
          {
            snapshot_id: "snap-1",
            scheduled_for: "2025-03-15",
            completed_at: "2025-03-20",
          },
        ],
      },
      meta: { format: "text" },
    };
    const output = formatResult("snapshot", result);
    assert.ok(output.includes("snap-1"));
    assert.ok(output.includes("2025-03-15"));
  });

  it("falls back to JSON for unknown command", () => {
    const result = { view: { data: 1 }, meta: { format: "text" } };
    const output = formatResult("nonexistent", result);
    assert.ok(output.includes('"data"'));
  });
});

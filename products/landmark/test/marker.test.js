import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertRejectsMessage } from "@forwardimpact/libmock";

import { runMarkerCommand } from "../src/commands/marker.js";
import { MAP_DATA } from "./fixtures.js";

// Marker tests exercise per-skill marker lookup. We derive two variants from
// the shared MAP_DATA: one where task_completion keeps its markers but
// planning has no markers block, and one where no skill has any markers.
const MAP_DATA_WITH_MARKERS = {
  ...MAP_DATA,
  skills: [
    MAP_DATA.skills.find((s) => s.id === "task_completion"),
    { id: "planning", name: "Planning" /* No markers */ },
  ],
};

const MAP_DATA_NO_MARKERS = {
  ...MAP_DATA,
  skills: [
    { id: "task_completion", name: "Task Completion" },
    { id: "planning", name: "Planning" },
  ],
};

describe("marker command", () => {
  it("returns markers for a skill that has them", async () => {
    const result = await runMarkerCommand({
      args: ["task_completion"],
      options: {},
      mapData: MAP_DATA_WITH_MARKERS,
      format: "text",
    });
    assert.equal(result.view.skill, "task_completion");
    assert.ok(result.view.markers.awareness);
    assert.ok(result.view.markers.working);
    assert.equal(result.meta.emptyState, undefined);
  });

  it("returns empty state for skill without markers", async () => {
    const result = await runMarkerCommand({
      args: ["planning"],
      options: {},
      mapData: MAP_DATA_WITH_MARKERS,
      format: "text",
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("planning"));
  });

  it("returns empty state when no markers exist in data", async () => {
    const result = await runMarkerCommand({
      args: ["task_completion"],
      options: {},
      mapData: MAP_DATA_NO_MARKERS,
      format: "text",
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("task_completion"));
  });

  it("filters by --level", async () => {
    const result = await runMarkerCommand({
      args: ["task_completion"],
      options: { level: "working" },
      mapData: MAP_DATA_WITH_MARKERS,
      format: "text",
    });
    assert.ok(result.view.markers.working);
    assert.equal(result.view.markers.awareness, undefined);
  });

  it("returns empty state for unknown level filter", async () => {
    const result = await runMarkerCommand({
      args: ["task_completion"],
      options: { level: "expert" },
      mapData: MAP_DATA_WITH_MARKERS,
      format: "text",
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("expert"));
  });

  it("returns empty state for unknown skill", async () => {
    const result = await runMarkerCommand({
      args: ["nonexistent"],
      options: {},
      mapData: MAP_DATA_WITH_MARKERS,
      format: "text",
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nonexistent"));
  });

  it("throws when skill id is missing", async () => {
    await assertRejectsMessage(
      () =>
        runMarkerCommand({
          args: [],
          options: {},
          mapData: MAP_DATA_WITH_MARKERS,
          format: "text",
        }),
      /skill id is required/,
    );
  });
});

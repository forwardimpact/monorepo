import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockQueries } from "@forwardimpact/libmock";

import { runReadinessCommand } from "../src/commands/readiness.js";
import { toText } from "../src/formatters/readiness.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";
import { MAP_DATA } from "./fixtures.js";

function stubQueries({
  person = undefined,
  evidence = [],
  artifacts = [],
  unscored = [],
} = {}) {
  return createMockQueries({
    getPerson: async (_sb, email) => {
      if (person === null) return null;
      return (
        person ?? {
          email,
          name: "Alice",
          discipline: "software_engineering",
          level: "J040",
          track: "platform",
        }
      );
    },
    getEvidence: evidence,
    getArtifacts: artifacts,
    getUnscoredArtifacts: unscored,
  });
}

describe("readiness command", () => {
  it("generates checklist for J040 targeting J060", async () => {
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        evidence: [
          {
            skill_id: "task_completion",
            matched: true,
            marker_text: "Delivered feature end-to-end",
            artifact_id: "a1",
          },
        ],
      }),
    });
    assert.ok(result.view);
    assert.equal(result.view.currentLevel, "J040");
    assert.equal(result.view.targetLevel, "J060");
    assert.ok(result.view.checklist.length > 0);
    assert.ok(result.view.summary.total > 0);
    assert.equal(result.view.skippedSkills.length, 0);
  });

  it("returns NO_HIGHER_LEVEL for J060 (highest)", async () => {
    const result = await runReadinessCommand({
      options: { email: "bob@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        person: {
          email: "bob@example.com",
          name: "Bob",
          discipline: "software_engineering",
          level: "J060",
          track: null,
        },
      }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("J060"));
  });

  it("skips skills with no markers at required proficiency", async () => {
    const mapDataPartialMarkers = {
      ...MAP_DATA,
      skills: [
        {
          id: "task_completion",
          name: "Task Completion",
          markers: {
            working: {
              human: ["Delivered feature end-to-end"],
              agent: ["Multi-file change"],
            },
          },
        },
        {
          id: "planning",
          name: "Planning",
          // No markers at any level
        },
        {
          id: "incident_response",
          name: "Incident Response",
          markers: {
            awareness: {
              human: ["Followed escalation"],
              agent: ["Health check alert"],
            },
          },
        },
      ],
    };
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: mapDataPartialMarkers,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.ok(result.view);
    assert.ok(result.view.skippedSkills.length > 0);
    assert.ok(result.view.checklist.length > 0);
  });

  it("returns NO_MARKERS_AT_TARGET when all skills lack markers", async () => {
    const mapDataNoMarkers = {
      ...MAP_DATA,
      skills: [
        { id: "task_completion", name: "Task Completion" },
        { id: "planning", name: "Planning" },
        { id: "incident_response", name: "Incident Response" },
      ],
    };
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: mapDataNoMarkers,
      supabase: {},
      format: "text",
      queries: stubQueries(),
    });
    assert.equal(result.view, null);
    assert.equal(result.meta.emptyState, EMPTY_STATES.NO_MARKERS_AT_TARGET);
  });

  it("returns PERSON_NOT_FOUND for unknown email", async () => {
    const result = await runReadinessCommand({
      options: { email: "nobody@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ person: null }),
    });
    assert.equal(result.view, null);
    assert.ok(result.meta.emptyState.includes("nobody@example.com"));
  });

  it("attaches coverage to the view when the persona has artifacts", async () => {
    const artifacts = [{ artifact_id: "a1" }, { artifact_id: "a2" }];
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        artifacts,
        unscored: [{ artifact_id: "a2" }],
      }),
    });
    assert.ok(result.view);
    assert.deepEqual(result.view.coverage, {
      scored: 1,
      total: 2,
      ratio: 0.5,
    });
  });

  it("renders the coverage ratio adjacent to the markers-evidenced line above floor", async () => {
    const artifacts = Array.from({ length: 10 }, (_, i) => ({
      artifact_id: `a${i}`,
    }));
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        artifacts,
        unscored: artifacts.slice(4), // 4/10 scored = 40%, above floor
      }),
    });
    const text = toText(result.view);
    const lines = text.split("\n");
    const summaryIdx = lines.findIndex((l) => l.includes("markers evidenced."));
    const coverageIdx = lines.findIndex((l) =>
      l.includes("Evidence coverage: 4/10 artifacts interpreted (40.0%)."),
    );
    assert.ok(summaryIdx >= 0, "missing markers-evidenced line");
    assert.ok(coverageIdx >= 0, "missing coverage line");
    assert.ok(
      coverageIdx - summaryIdx >= 1 && coverageIdx - summaryIdx <= 2,
      `coverage line ${coverageIdx - summaryIdx} lines after summary`,
    );
  });

  it("wraps the verdict in negative-evidence copy below the floor", async () => {
    const artifacts = Array.from({ length: 100 }, (_, i) => ({
      artifact_id: `a${i}`,
    }));
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        artifacts,
        unscored: artifacts.slice(1), // 1/100 = 1%, below floor
      }),
    });
    const text = toText(result.view);
    assert.match(
      text,
      /Coverage below floor \(1\.0% < 30%\) — verdict suppressed\./,
    );
    assert.match(text, /Evidence coverage: 1\/100 artifacts interpreted/);
    assert.match(text, /lift the floor/);
    assert.doesNotMatch(text, /markers evidenced/);
    assert.doesNotMatch(text, /Missing:/);
    assert.doesNotMatch(text, /\[ \]/);
  });

  it("renders the checklist, not below-floor copy, for a zero-artifact persona", async () => {
    const result = await runReadinessCommand({
      options: { email: "alice@example.com" },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({ artifacts: [] }),
    });
    assert.equal(result.view.coverage, null);
    const text = toText(result.view);
    assert.match(text, /markers evidenced/);
    assert.doesNotMatch(text, /Coverage below floor/);
    assert.doesNotMatch(text, /Evidence coverage:/);
  });

  it("reports unknown discipline (not unknown level) when the persona's discipline isn't defined", async () => {
    const result = await runReadinessCommand({
      options: {
        email: "daedalus@bionova.example",
        target: "J090",
      },
      mapData: MAP_DATA,
      supabase: {},
      format: "text",
      queries: stubQueries({
        person: {
          email: "daedalus@bionova.example",
          name: "Daedalus",
          discipline: "data_engineering",
          level: "J080",
          track: null,
        },
      }),
    });
    assert.equal(result.view, null);
    assert.match(
      result.meta.emptyState,
      /unknown discipline "data_engineering"/i,
    );
    assert.match(
      result.meta.emptyState,
      /Available disciplines: software_engineering/,
    );
    assert.doesNotMatch(result.meta.emptyState, /Unknown level/);
  });
});

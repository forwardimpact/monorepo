import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runReadinessCommand } from "../src/commands/readiness.js";
import { EMPTY_STATES } from "../src/lib/empty-state.js";

const MAP_DATA = {
  levels: [
    {
      id: "J040",
      professionalTitle: "Level I",
      ordinalRank: 1,
      baseSkillProficiencies: {
        primary: "foundational",
        secondary: "awareness",
        broad: "awareness",
      },
    },
    {
      id: "J060",
      professionalTitle: "Level II",
      ordinalRank: 2,
      baseSkillProficiencies: {
        primary: "working",
        secondary: "foundational",
        broad: "awareness",
      },
    },
  ],
  disciplines: [
    {
      id: "software_engineering",
      coreSkills: ["task_completion"],
      supportingSkills: ["planning"],
      broadSkills: ["incident_response"],
    },
  ],
  tracks: [{ id: "platform", skillModifiers: {} }],
  skills: [
    {
      id: "task_completion",
      name: "Task Completion",
      markers: {
        awareness: {
          human: ["Closed a task by following a runbook"],
          agent: ["Applied an existing pattern"],
        },
        foundational: {
          human: [
            "Delivered a small feature",
            "Estimated and completed a task",
          ],
          agent: ["Single-file change passes CI"],
        },
        working: {
          human: [
            "Delivered feature end-to-end",
            "Resolved production issue within SLA",
          ],
          agent: ["Multi-file change passes CI"],
        },
      },
    },
    {
      id: "planning",
      name: "Planning",
      markers: {
        awareness: {
          human: ["Followed a project plan"],
          agent: ["Executed prescribed steps"],
        },
        foundational: {
          human: ["Created a task breakdown"],
          agent: ["Generated an implementation plan"],
        },
        working: {
          human: ["Planned and delivered across sprints"],
          agent: ["Multi-part plan with dependencies"],
        },
      },
    },
    {
      id: "incident_response",
      name: "Incident Response",
      markers: {
        awareness: {
          human: ["Followed escalation procedure"],
          agent: ["Identified failing health check"],
        },
        foundational: {
          human: ["Gathered diagnostic info"],
          agent: ["Collected log entries"],
        },
        working: {
          human: ["Led incident response"],
          agent: ["Diagnosed production issue"],
        },
      },
    },
  ],
  capabilities: [],
};

function stubQueries({ person = undefined, evidence = [] } = {}) {
  return {
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
    getEvidence: async () => evidence,
  };
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
});

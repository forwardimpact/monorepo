/**
 * Shared test fixtures for landmark tests.
 *
 * These constants consolidate the previously-duplicated MAP_DATA, TEAM,
 * SNAPSHOTS, SCORES, EVIDENCE_ROWS, COMMENTS, and PATTERNS fixtures across
 * the landmark test suite. Tests that need a variant should import the base
 * and spread with overrides, e.g.:
 *
 *   import { MAP_DATA } from "./fixtures.js";
 *   const partial = { ...MAP_DATA, skills: [{ id: "x", name: "X" }] };
 */

export const PEOPLE = [
  {
    email: "alice@example.com",
    name: "Alice",
    discipline: "software-engineering",
    level: "J040",
    track: null,
    manager_email: null,
  },
  {
    email: "bob@example.com",
    name: "Bob",
    discipline: "software-engineering",
    level: "J060",
    track: "platform",
    manager_email: "alice@example.com",
  },
];

export const TEAM = [
  {
    email: "alice@example.com",
    name: "Alice",
    discipline: "software-engineering",
    level: "J040",
    track: "platform",
  },
  {
    email: "bob@example.com",
    name: "Bob",
    discipline: "software-engineering",
    level: "J060",
    track: null,
  },
];

export const SNAPSHOTS = [
  {
    snapshot_id: "snap-1",
    scheduled_for: "2025-03-15",
    completed_at: "2025-03-20",
  },
  {
    snapshot_id: "snap-2",
    scheduled_for: "2024-12-15",
    completed_at: "2025-01-05",
  },
];

export const SCORES = [
  {
    snapshot_id: "snap-1",
    item_id: "quality",
    item_name: "Quality",
    score: 42,
    vs_prev: -5,
    vs_org: -10,
    vs_50th: -8,
    vs_75th: -25,
    vs_90th: -40,
  },
];

export const EVIDENCE_ROWS = [
  {
    skill_id: "task-completion",
    level_id: "working",
    marker_text: "Delivered a feature",
    matched: true,
    artifact_id: "art-1",
    rationale: "Clean delivery",
    created_at: "2025-01-15T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "task-completion",
    level_id: "foundational",
    marker_text: "Small feature",
    matched: false,
    artifact_id: "art-2",
    rationale: null,
    created_at: "2025-01-10T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
  {
    skill_id: "planning",
    level_id: "awareness",
    marker_text: "Followed plan",
    matched: true,
    artifact_id: "art-3",
    rationale: "On track",
    created_at: "2025-02-01T00:00:00Z",
    github_artifacts: { email: "alice@example.com" },
  },
];

export const COMMENTS = [
  {
    comment_id: "c1",
    snapshot_id: "snap-1",
    email: "alice@example.com",
    text: "Estimation is always off, we overcommit every sprint",
    timestamp: "2025-03-10T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2025-Q1" },
  },
  {
    comment_id: "c2",
    snapshot_id: "snap-1",
    email: "bob@example.com",
    text: "Incident response is painful, no runbook for the payment service",
    timestamp: "2025-03-11T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2025-Q1" },
  },
  {
    comment_id: "c3",
    snapshot_id: "snap-2",
    email: "alice@example.com",
    text: "Planning process improved this quarter",
    timestamp: "2024-12-10T00:00:00Z",
    getdx_snapshots: { scheduled_for: "2024-Q4" },
  },
];

export const PATTERNS = [
  { skill_id: "task-completion", matched: 5, unmatched: 2, total: 7 },
  { skill_id: "planning", matched: 1, unmatched: 3, total: 4 },
];

/**
 * Full standard MAP_DATA shared by readiness / health / practiced tests.
 * Contains drivers, skills (with markers for task-completion & planning),
 * levels J040 & J060, one discipline, one track, and empty capabilities.
 */
export const MAP_DATA = {
  drivers: [
    {
      id: "quality",
      name: "Quality",
      contributingSkills: ["task-completion", "planning"],
      contributingBehaviours: ["systems-thinking"],
    },
    {
      id: "reliability",
      name: "Reliability",
      contributingSkills: ["incident-response"],
      contributingBehaviours: ["systems-thinking"],
    },
  ],
  levels: [
    {
      id: "J040",
      professionalTitle: "Level I",
      ordinalRank: 1,
      baseSkillProficiencies: {
        core: "foundational",
        supporting: "awareness",
        broad: "awareness",
      },
    },
    {
      id: "J060",
      professionalTitle: "Level II",
      ordinalRank: 2,
      baseSkillProficiencies: {
        core: "working",
        supporting: "foundational",
        broad: "awareness",
      },
    },
  ],
  disciplines: [
    {
      id: "software-engineering",
      coreSkills: ["task-completion"],
      supportingSkills: ["planning"],
      broadSkills: ["incident-response"],
    },
  ],
  tracks: [{ id: "platform", skillModifiers: {} }],
  skills: [
    {
      id: "task-completion",
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
      id: "incident-response",
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

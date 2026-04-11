/**
 * Team trajectory — compute quarterly coverage evolution from a
 * pre-assembled list of historical rosters.
 *
 * All git I/O happens in the command handler; this module is pure
 * and only transforms snapshots into the `TeamTrajectory` shape.
 */

import { computeCoverage, resolveTeam } from "./coverage.js";

/**
 * @typedef {object} HistoricalRoster
 * @property {string} quarter - e.g. "2025-Q1".
 * @property {import("../roster/yaml.js").Roster} roster
 */

/**
 * @typedef {object} TrajectoryQuarter
 * @property {string} quarter
 * @property {number} memberCount
 * @property {object[]} rosterChanges
 * @property {Record<string, number>} coverage - skillId → headcount depth
 */

/**
 * @typedef {object} TeamTrajectory
 * @property {string} teamId
 * @property {TrajectoryQuarter[]} quarters
 * @property {string[]} persistentGaps
 * @property {Record<string, string>} trends
 */

/**
 * Compute a trajectory from historical rosters.
 *
 * @param {object} params
 * @param {HistoricalRoster[]} params.historicalRosters
 * @param {string} params.teamId
 * @param {object} params.data - Loaded Map data.
 * @returns {TeamTrajectory}
 */
export function computeTrajectory({ historicalRosters, teamId, data }) {
  const quarters = [];
  let previousMembers = null;

  for (const snap of historicalRosters) {
    const team = snap.roster.teams.get(teamId);
    if (!team) {
      quarters.push({
        quarter: snap.quarter,
        memberCount: 0,
        rosterChanges: [],
        coverage: {},
      });
      continue;
    }

    const resolved = resolveTeam(snap.roster, data, { teamId });
    const coverage = computeCoverage(resolved, data);
    const depthMap = {};
    for (const [skillId, skill] of coverage.skills) {
      depthMap[skillId] = skill.headcountDepth;
    }
    quarters.push({
      quarter: snap.quarter,
      memberCount: team.members.length,
      rosterChanges: diffRosterMembers(previousMembers, team.members),
      coverage: depthMap,
    });
    previousMembers = team.members;
  }

  return {
    teamId,
    quarters,
    persistentGaps: findPersistentGaps(quarters),
    trends: classifyTrends(quarters),
  };
}

/**
 * Bucket a list of commits by calendar quarter, keeping the latest
 * commit per quarter.
 *
 * @param {{ sha: string, date: Date }[]} commits
 * @param {number} maxQuarters
 * @returns {Array<{ quarter: string, sha: string, date: Date }>}
 */
export function bucketCommitsByQuarter(commits, maxQuarters) {
  const byQuarter = new Map();
  for (const commit of commits) {
    const quarter = quarterLabel(commit.date);
    if (!byQuarter.has(quarter)) {
      byQuarter.set(quarter, commit);
    }
  }
  const sorted = [...byQuarter.entries()]
    .map(([quarter, commit]) => ({
      quarter,
      sha: commit.sha,
      date: commit.date,
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
  if (maxQuarters && sorted.length > maxQuarters) {
    return sorted.slice(sorted.length - maxQuarters);
  }
  return sorted;
}

function quarterLabel(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-based
  const q = Math.floor(month / 3) + 1;
  return `${year}-Q${q}`;
}

function diffRosterMembers(previous, current) {
  if (!previous) return [];
  const prevByEmail = new Map(previous.map((m) => [m.email, m]));
  const currByEmail = new Map(current.map((m) => [m.email, m]));
  const changes = [];
  for (const [email, member] of currByEmail) {
    if (!prevByEmail.has(email)) {
      changes.push({ type: "join", name: member.name, email });
      continue;
    }
    const before = prevByEmail.get(email);
    if (before.job.level !== member.job.level) {
      changes.push({
        type: "promote",
        name: member.name,
        email,
        from: before.job.level,
        to: member.job.level,
      });
    }
  }
  for (const [email, member] of prevByEmail) {
    if (!currByEmail.has(email)) {
      changes.push({ type: "leave", name: member.name, email });
    }
  }
  return changes;
}

function findPersistentGaps(quarters) {
  if (quarters.length === 0) return [];
  const allSkills = new Set();
  for (const q of quarters) {
    for (const skillId of Object.keys(q.coverage)) {
      allSkills.add(skillId);
    }
  }
  const persistent = [];
  for (const skillId of allSkills) {
    if (quarters.every((q) => (q.coverage[skillId] ?? 0) === 0)) {
      persistent.push(skillId);
    }
  }
  return persistent.sort();
}

function classifyTrends(quarters) {
  const trends = {};
  if (quarters.length === 0) return trends;
  const first = quarters[0].coverage;
  const last = quarters[quarters.length - 1].coverage;
  const allSkills = new Set([...Object.keys(first), ...Object.keys(last)]);
  for (const skillId of allSkills) {
    const f = first[skillId] ?? 0;
    const l = last[skillId] ?? 0;
    if (f === 0 && l === 0) {
      trends[skillId] = "persistent_gap";
      continue;
    }
    if (l > f) trends[skillId] = "improving";
    else if (l < f) trends[skillId] = "declining";
    else trends[skillId] = "stable";
  }
  return trends;
}

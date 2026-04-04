/**
 * Activity generation — roster, teams, snapshots, scores, webhooks, evidence.
 *
 * @module libuniverse/engine/activity
 */

import { generateWebhooks } from "./activity-webhooks.js";
import { deriveInitiatives } from "./activity-initiatives.js";
import { generateCommentKeys } from "./activity-comments.js";
import { generateRosterSnapshots } from "./activity-roster.js";

const ALL_DRIVERS = [
  "clear_direction",
  "say_on_priorities",
  "requirements_quality",
  "ease_of_release",
  "test_efficiency",
  "managing_tech_debt",
  "code_review",
  "documentation",
  "codebase_experience",
  "incident_response",
  "learning_culture",
  "experimentation",
  "connectedness",
  "efficient_processes",
  "deep_work",
  "leveraging_user_feedback",
];

const DRIVER_NAMES = Object.fromEntries(
  ALL_DRIVERS.map((d) => [
    d,
    d
      .split("_")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
  ]),
);

const PROFICIENCY_ORDER = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];

/**
 * Generate all activity data from AST and entities.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @returns {object}
 */
export function generateActivity(ast, rng, people, teams) {
  const roster = people.map((p) => ({
    email: p.email,
    name: p.name,
    github_username: p.github_username,
    discipline: p.discipline,
    level: p.level,
    track: p.track,
    manager_email: p.manager_email,
    team_id: p.team_id,
  }));

  const activityTeams = buildActivityTeams(ast, teams);
  const snapshots = generateSnapshots(ast);
  const scores = generateScores(ast, rng, snapshots, activityTeams);
  const webhooks = generateWebhooks(ast, rng, people, teams);
  const evidence = generateEvidence(ast, rng, people, teams);
  const { scorecards, initiatives } = deriveInitiatives(
    ast,
    rng,
    people,
    teams,
    snapshots,
  );
  const commentKeys = generateCommentKeys(ast, rng, people, teams, snapshots);
  const rosterSnapshots = generateRosterSnapshots(
    ast,
    rng,
    people,
    teams,
    snapshots,
  );
  const projectTeams = deriveProjectTeams(ast, rng, people, teams);

  return {
    roster,
    activityTeams,
    snapshots,
    scores,
    webhooks,
    evidence,
    initiatives,
    scorecards,
    commentKeys,
    rosterSnapshots,
    projectTeams,
  };
}

function buildActivityTeams(ast, teams) {
  const result = [];

  for (const org of ast.orgs) {
    result.push({
      getdx_team_id: `gdx_org_${org.id}`,
      name: org.name,
      is_parent: true,
      parent_id: null,
      manager_id: null,
      contributors: 0,
      reference_id: null,
      ancestors: [],
      last_changed_at: new Date("2025-01-01").toISOString(),
    });
  }

  const orgMap = new Map(ast.orgs.map((o) => [o.id, o]));
  for (const dept of ast.departments) {
    const parentOrg = orgMap.get(dept.parent);
    result.push({
      getdx_team_id: `gdx_dept_${dept.id}`,
      name: dept.name,
      is_parent: true,
      parent_id: parentOrg ? `gdx_org_${parentOrg.id}` : null,
      manager_id: null,
      contributors: dept.headcount,
      reference_id: null,
      ancestors: parentOrg ? [`gdx_org_${parentOrg.id}`] : [],
      last_changed_at: new Date("2025-01-01").toISOString(),
    });
  }

  const deptMap = new Map(ast.departments.map((d) => [d.id, d]));
  for (const team of teams) {
    const dept = deptMap.get(team.department);
    const parentDeptId = dept ? `gdx_dept_${dept.id}` : null;
    const parentOrg = dept ? orgMap.get(dept.parent) : null;
    const ancestors = [];
    if (parentOrg) ancestors.push(`gdx_org_${parentOrg.id}`);
    if (parentDeptId) ancestors.push(parentDeptId);

    result.push({
      getdx_team_id: team.getdx_team_id,
      name: team.name,
      is_parent: false,
      parent_id: parentDeptId,
      manager_id: team.manager ? `gdx_mgr_${team.manager}` : null,
      contributors: team.size,
      reference_id: null,
      ancestors,
      last_changed_at: new Date("2025-01-01").toISOString(),
    });
  }

  return result;
}

function generateSnapshots(ast) {
  if (!ast.snapshots) return [];
  const [fromY, fromM] = ast.snapshots.quarterly_from.split("-").map(Number);
  const [toY, toM] = ast.snapshots.quarterly_to.split("-").map(Number);
  const snaps = [];
  let y = fromY,
    m = fromM;

  while (y < toY || (y === toY && m <= toM)) {
    const q = Math.ceil(m / 3);
    const id = `snap_${y}_Q${q}`;
    const done = new Date(y, m, 1).toISOString();
    snaps.push({
      snapshot_id: id,
      account_id: ast.snapshots.account_id,
      last_result_change_at: done,
      scheduled_for: `${y}-${String(m).padStart(2, "0")}-15`,
      completed_at: done,
      completed_count: 180,
      deleted_at: null,
      total_count: ast.people?.count || 50,
    });
    m += 3;
    if (m > 12) {
      m -= 12;
      y++;
    }
  }

  return snaps;
}

function applyScenarioEffects(ast, snapDate, team, driverId, base) {
  let adjusted = base;
  for (const scenario of ast.scenarios) {
    const start = new Date(scenario.timerange_start + "-01");
    const end = new Date(scenario.timerange_end + "-28");
    if (snapDate < start || snapDate > end) continue;
    for (const affect of scenario.affects) {
      if (team.getdx_team_id !== `gdx_team_${affect.team_id}`) continue;
      const dx = (affect.dx_drivers || []).find(
        (d) => d.driver_id === driverId,
      );
      if (dx) adjusted += dx.magnitude * ((snapDate - start) / (end - start));
    }
  }
  return adjusted;
}

function generateScores(ast, rng, snapshots, activityTeams) {
  const scores = [];
  const leafTeams = activityTeams.filter((t) => !t.is_parent);

  for (const snap of snapshots) {
    const snapDate = new Date(snap.completed_at);
    for (const team of leafTeams) {
      for (const driverId of ALL_DRIVERS) {
        const base = applyScenarioEffects(
          ast,
          snapDate,
          team,
          driverId,
          65 + rng.gaussian(0, 8),
        );

        const score = Math.max(0, Math.min(100, Math.round(base * 10) / 10));
        scores.push({
          snapshot_id: snap.snapshot_id,
          snapshot_team_id: `st_${snap.snapshot_id}_${team.getdx_team_id}`,
          team_name: team.name,
          getdx_team_id: team.getdx_team_id,
          is_parent: team.is_parent,
          parent_id: team.parent_id,
          ancestors: team.ancestors,
          item_id: driverId,
          item_type: "driver",
          item_name: DRIVER_NAMES[driverId] || driverId,
          response_count: rng.randomInt(5, team.contributors || 10),
          score,
          contributor_count: team.contributors || 0,
          vs_prev: round1(rng.gaussian(0, 3)),
          vs_org: round1(rng.gaussian(0, 5)),
          vs_50th: round1(rng.gaussian(2, 5)),
          vs_75th: round1(rng.gaussian(-3, 5)),
          vs_90th: round1(rng.gaussian(-8, 5)),
        });
      }
    }
  }

  return scores;
}

function generateEvidence(ast, rng, people, teams) {
  const evidence = [];

  for (const scenario of ast.scenarios) {
    const sStart = new Date(scenario.timerange_start + "-01");
    const sEnd = new Date(scenario.timerange_end + "-28");

    for (const affect of scenario.affects) {
      const team = teams.find((t) => t.id === affect.team_id);
      if (!team) continue;
      const teamPeople = people.filter((p) => p.team_id === team.id);
      const floorIdx = PROFICIENCY_ORDER.indexOf(affect.evidence_floor);

      for (const person of teamPeople) {
        for (const skillId of affect.evidence_skills || []) {
          const profIdx = Math.min(
            PROFICIENCY_ORDER.length - 1,
            Math.max(floorIdx, floorIdx + rng.randomInt(0, 1)),
          );
          evidence.push({
            person_email: person.email,
            person_name: person.name,
            skill_id: skillId,
            proficiency: PROFICIENCY_ORDER[profIdx],
            scenario_id: scenario.id,
            team_id: team.id,
            observed_at: randDate(rng, sStart, sEnd).toISOString(),
            source: "synthetic",
          });
        }
      }
    }
  }

  return evidence;
}

function deriveProjectTeams(ast, rng, people, _teams) {
  const projectTeams = [];

  for (const project of ast.projects) {
    const projectTeamIds = project.teams || [];
    const members = [];

    for (const teamId of projectTeamIds) {
      const teamPeople = people.filter((p) => p.team_id === teamId);
      const count = Math.max(2, Math.round(teamPeople.length * 0.6));
      const selected = rng.shuffle([...teamPeople]).slice(0, count);

      for (const person of selected) {
        const allocation =
          projectTeamIds.length > 1 && rng.random() > 0.5
            ? Math.round(rng.random() * 0.6 * 10 + 4) / 10
            : 1.0;
        members.push({
          email: person.email,
          name: person.name,
          job: {
            discipline: person.discipline,
            level: person.level,
            track: person.track || undefined,
          },
          allocation,
        });
      }
    }

    projectTeams.push({
      id: project.id,
      name: project.name,
      members,
    });
  }

  return projectTeams;
}

function randDate(rng, start, end) {
  return new Date(
    start.getTime() + rng.random() * (end.getTime() - start.getTime()),
  );
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

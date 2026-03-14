/**
 * Activity generation — roster, teams, snapshots, scores, webhooks, evidence.
 *
 * @module libuniverse/engine/activity
 */

import { generateHash } from "@forwardimpact/libutil";

const COMMIT_MULT = {
  baseline: 1.0,
  moderate: 1.5,
  elevated: 2.5,
  spike: 4.0,
  sustained_spike: 3.5,
  very_high: 5.0,
};
const PR_MULT = { baseline: 1.0, moderate: 1.3, elevated: 2.0, very_high: 3.5 };

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

const FEATURES = [
  "authentication",
  "pipeline",
  "scoring",
  "analytics",
  "export",
  "batch-processing",
  "data-validation",
  "api-gateway",
  "monitoring",
  "caching",
  "search",
  "notification",
  "scheduling",
  "reporting",
];

const COMMIT_MSGS = [
  "Add {f} endpoint",
  "Fix {f} validation",
  "Update {f} tests",
  "Refactor {f} module",
  "Optimize {f} performance",
  "Add error handling for {f}",
  "Update {f} documentation",
  "Implement {f} caching",
  "Add {f} monitoring",
  "Fix race condition in {f}",
  "Migrate {f} to new API",
  "Add integration tests for {f}",
  "Clean up {f} imports",
];

const PR_TITLES = [
  "Add {f} support",
  "Implement {f} workflow",
  "Fix {f} edge cases",
  "Upgrade {f} dependencies",
  "Refactor {f} architecture",
  "Add {f} tests",
];

const PR_BODIES = [
  "LGTM",
  "Looks good to me!",
  "Nice work.",
  "A few minor comments.",
  "Please address the feedback.",
  "Approved with minor suggestions.",
];

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

function generateScores(ast, rng, snapshots, activityTeams) {
  const scores = [];
  const leafTeams = activityTeams.filter((t) => !t.is_parent);

  for (const snap of snapshots) {
    const snapDate = new Date(snap.completed_at);
    for (const team of leafTeams) {
      for (const driverId of ALL_DRIVERS) {
        let base = 65 + rng.gaussian(0, 8);

        for (const scenario of ast.scenarios) {
          const start = new Date(scenario.timerange_start + "-01");
          const end = new Date(scenario.timerange_end + "-28");
          if (snapDate >= start && snapDate <= end) {
            for (const affect of scenario.affects) {
              if (team.getdx_team_id === `gdx_team_${affect.team_id}`) {
                const dx = (affect.dx_drivers || []).find(
                  (d) => d.driver_id === driverId,
                );
                if (dx)
                  base += dx.magnitude * ((snapDate - start) / (end - start));
              }
            }
          }
        }

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

function generateWebhooks(ast, rng, people, teams) {
  const webhooks = [];
  const starts = ast.scenarios.map((s) => new Date(s.timerange_start + "-01"));
  const ends = ast.scenarios.map((s) => new Date(s.timerange_end + "-28"));
  const globalStart = new Date(Math.min(...starts, new Date("2024-07-01")));
  const globalEnd = new Date(Math.max(...ends, new Date("2026-01-28")));

  const membersByTeam = new Map();
  for (const team of teams)
    membersByTeam.set(
      team.id,
      people.filter((p) => p.team_id === team.id),
    );

  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  let week = new Date(globalStart);
  let counter = 0;

  while (week < globalEnd) {
    const weekEnd = new Date(week.getTime() + oneWeek);

    for (const team of teams) {
      const members = membersByTeam.get(team.id) || [];
      if (members.length === 0) continue;

      let cm = 1,
        pm = 1;
      for (const s of ast.scenarios) {
        const sStart = new Date(s.timerange_start + "-01");
        const sEnd = new Date(s.timerange_end + "-28");
        if (week >= sStart && week <= sEnd) {
          for (const a of s.affects) {
            if (a.team_id === team.id) {
              cm = Math.max(cm, COMMIT_MULT[a.github_commits] || 1);
              pm = Math.max(pm, PR_MULT[a.github_prs] || 1);
            }
          }
        }
      }

      const orgName = ast.orgs[0]?.id || "org";
      const pushCount = Math.round(members.length * cm * 0.3);
      for (let i = 0; i < pushCount; i++) {
        const author = rng.pick(members);
        const repo = rng.pick(
          team.repos.length > 0 ? team.repos : ["default-repo"],
        );
        const feat = rng.pick(FEATURES);
        const ts = randDate(rng, week, weekEnd);
        const cid = generateHash(
          String(counter),
          author.name,
          ts.toISOString(),
        );

        webhooks.push({
          delivery_id: `evt-${String(++counter).padStart(8, "0")}`,
          event_type: "push",
          occurred_at: ts.toISOString(),
          payload: {
            ref: "refs/heads/main",
            commits: [
              {
                id: cid + cid,
                message: rng.pick(COMMIT_MSGS).replace("{f}", feat),
                timestamp: ts.toISOString(),
                added: [`src/${feat}.js`],
                removed: [],
                modified: ["src/index.js"],
              },
            ],
            repository: { full_name: `${orgName}/${repo}` },
            sender: { login: author.github_username },
          },
        });
      }

      const prCount = Math.round(members.length * pm * 0.15);
      for (let i = 0; i < prCount; i++) {
        const author = rng.pick(members);
        const repo = rng.pick(
          team.repos.length > 0 ? team.repos : ["default-repo"],
        );
        const feat = rng.pick(FEATURES);
        const ts = randDate(rng, week, weekEnd);
        const prNum = rng.randomInt(1, 999);
        const branch = `feature/${feat}`;

        webhooks.push({
          delivery_id: `evt-${String(++counter).padStart(8, "0")}`,
          event_type: "pull_request",
          occurred_at: ts.toISOString(),
          payload: {
            action: rng.pick(["opened", "closed"]),
            number: prNum,
            pull_request: {
              number: prNum,
              title: rng.pick(PR_TITLES).replace("{f}", feat),
              state: "open",
              user: { login: author.github_username },
              created_at: ts.toISOString(),
              updated_at: ts.toISOString(),
              additions: rng.randomInt(10, 500),
              deletions: rng.randomInt(0, 100),
              changed_files: rng.randomInt(1, 20),
              merged: false,
              base: { ref: "main" },
              head: { ref: branch },
            },
            repository: { full_name: `${orgName}/${repo}` },
            sender: { login: author.github_username },
          },
        });

        if (rng.random() > 0.4) {
          const reviewer = rng.pick(
            members.filter((m) => m.name !== author.name) || [author],
          );
          const rts = new Date(ts.getTime() + rng.randomInt(1, 48) * 3600000);
          webhooks.push({
            delivery_id: `evt-${String(++counter).padStart(8, "0")}`,
            event_type: "pull_request_review",
            occurred_at: rts.toISOString(),
            payload: {
              action: "submitted",
              review: {
                id: rng.randomInt(10000, 99999),
                user: { login: reviewer.github_username },
                state: rng.pick(["approved", "changes_requested", "commented"]),
                body: rng.pick(PR_BODIES),
                submitted_at: rts.toISOString(),
              },
              pull_request: { number: prNum },
              repository: { full_name: `${orgName}/${repo}` },
              sender: { login: reviewer.github_username },
            },
          });
        }
      }
    }

    week = weekEnd;
  }

  return webhooks;
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

/**
 * Derive initiatives and scorecards from projects and scenarios.
 * Declining drivers produce remediation initiatives; rising drivers produce
 * improvement-tracking initiatives.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} snapshots
 * @returns {{ scorecards: object[], initiatives: object[] }}
 */
function deriveInitiatives(ast, rng, people, teams, snapshots) {
  const scorecards = [];
  const initiatives = [];
  const driverMap = new Map(
    (ast.framework?.drivers || []).map((d) => [d.id, d]),
  );
  let counter = 0;

  for (const scenario of ast.scenarios) {
    const project = ast.projects.find((p) =>
      scenario.affects.some((a) => (p.teams || []).includes(a.team_id)),
    );

    for (const affect of scenario.affects) {
      const team = teams.find((t) => t.id === affect.team_id);
      if (!team) continue;

      for (const dx of affect.dx_drivers || []) {
        const driver = driverMap.get(dx.driver_id);
        if (!driver) continue;

        counter++;
        const isDeclining = dx.magnitude < 0;
        const scorecardId = `sc_${scenario.id}_${affect.team_id}_${dx.driver_id}`;
        const scorecardName = isDeclining
          ? `${driver.name} Remediation`
          : `${driver.name} Improvement`;

        // Build scorecard checks from driver's contributing skills
        const checks = (driver.skills || []).map((skillId, i) => ({
          id: `chk_${scorecardId}_${i}`,
          name: skillId.replace(/_/g, " "),
          ordering: i,
          published: true,
          level: { id: `lvl_${i % 3}`, name: ["Red", "Yellow", "Green"][i % 3] },
        }));

        const levels = [
          { id: "lvl_0", name: "Red", rank: 1, color: "#dc2626" },
          { id: "lvl_1", name: "Yellow", rank: 2, color: "#eab308" },
          { id: "lvl_2", name: "Green", rank: 3, color: "#16a34a" },
        ];

        scorecards.push({
          id: scorecardId,
          name: scorecardName,
          description: `Scorecard tracking ${driver.name.toLowerCase()} for ${team.name}`,
          type: "LEVEL",
          published: true,
          checks,
          levels,
          tags: [
            { value: isDeclining ? "remediation" : "improvement", color: isDeclining ? "#dc2626" : "#16a34a" },
          ],
        });

        // Compute initiative completion from scenario timeline
        const endDate = new Date(scenario.timerange_end + "-28");
        const startDate = new Date(scenario.timerange_start + "-01");
        const totalDays =
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const elapsed = Math.min(
          totalDays,
          (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const rawPct = Math.max(0, Math.min(100, (elapsed / totalDays) * 100));
        const pctComplete = isDeclining
          ? Math.round(rawPct * 0.7)
          : Math.round(Math.min(100, rawPct * 1.1));

        const passedChecks = Math.round(
          (pctComplete / 100) * checks.length,
        );

        // Determine priority: more severe declining → higher priority (lower number)
        let priority;
        if (isDeclining) {
          if (dx.magnitude <= -6) priority = 0;
          else if (dx.magnitude <= -4) priority = 1;
          else priority = 2;
        } else {
          priority = dx.magnitude >= 5 ? 3 : 4;
        }

        // Set complete_by to scenario end + 1 quarter
        const completeBy = new Date(endDate);
        completeBy.setMonth(completeBy.getMonth() + 3);

        // Resolve owner to team manager
        const manager = people.find(
          (p) => p.team_id === team.id && p.is_manager,
        );
        const ownerPerson = manager || people.find((p) => p.team_id === team.id);

        const remainingDevDays = Math.round(
          ((100 - pctComplete) / 100) * totalDays * 0.3,
        );

        const tags = [
          { value: project?.type || "program", color: "#6366f1" },
          { value: dx.driver_id, color: "#8b5cf6" },
        ];
        if (isDeclining) tags.push({ value: "urgent", color: "#ef4444" });

        initiatives.push({
          id: `init_${String(counter).padStart(3, "0")}`,
          name: isDeclining
            ? `Address ${driver.name} in ${team.name}`
            : `Sustain ${driver.name} in ${team.name}`,
          description: isDeclining
            ? `Initiative to address declining ${driver.name.toLowerCase()} in ${team.name} during ${scenario.name}.`
            : `Track improvements in ${driver.name.toLowerCase()} for ${team.name} during ${scenario.name}.`,
          scorecard_id: scorecardId,
          scorecard_name: scorecardName,
          priority,
          published: true,
          complete_by: completeBy.toISOString().split("T")[0],
          percentage_complete: pctComplete,
          passed_checks: passedChecks,
          total_checks: checks.length,
          remaining_dev_days: remainingDevDays,
          owner: ownerPerson
            ? {
                id: `usr_${ownerPerson.id}`,
                name: ownerPerson.name,
                email: ownerPerson.email,
              }
            : { id: "usr_unknown", name: "Unknown", email: "unknown@example.com" },
          tags,
          // Internal fields for rendering/joining
          _scenario_id: scenario.id,
          _team_id: team.id,
          _driver_id: dx.driver_id,
          _trajectory: dx.trajectory,
        });
      }
    }
  }

  return { scorecards, initiatives };
}

/**
 * Generate comment metadata for LLM prose generation.
 * Each comment key contains scenario context for the LLM prompt.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} snapshots
 * @returns {object[]}
 */
function generateCommentKeys(ast, rng, people, teams, snapshots) {
  const commentsPerSnapshot = ast.snapshots?.comments_per_snapshot || 0;
  if (commentsPerSnapshot === 0) return [];

  const commentKeys = [];
  const driverMap = new Map(
    (ast.framework?.drivers || []).map((d) => [d.id, d]),
  );

  for (const snap of snapshots) {
    const snapDate = new Date(snap.completed_at);

    // Find active scenarios during this snapshot
    const activeScenarios = [];
    for (const scenario of ast.scenarios) {
      const start = new Date(scenario.timerange_start + "-01");
      const end = new Date(scenario.timerange_end + "-28");
      if (snapDate >= start && snapDate <= end) {
        activeScenarios.push(scenario);
      }
    }

    if (activeScenarios.length === 0) continue;

    // Collect affected team members with their scenario context
    const candidates = [];
    for (const scenario of activeScenarios) {
      for (const affect of scenario.affects) {
        const team = teams.find((t) => t.id === affect.team_id);
        if (!team) continue;
        const teamPeople = people.filter((p) => p.team_id === team.id);

        for (const person of teamPeople) {
          // Pick the most impactful driver for this person's comment
          const drivers = (affect.dx_drivers || []).sort(
            (a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude),
          );
          const topDriver = drivers[0];
          if (!topDriver) continue;

          const driverDef = driverMap.get(topDriver.driver_id);
          candidates.push({
            person,
            team,
            scenario,
            driver_id: topDriver.driver_id,
            driver_name: driverDef?.name || topDriver.driver_id,
            trajectory: topDriver.trajectory,
            magnitude: topDriver.magnitude,
          });
        }
      }
    }

    // Select comments_per_snapshot respondents, weighted toward declining drivers
    const selected = [];
    const shuffled = rng.shuffle([...candidates]);
    // Prioritize declining drivers
    const declining = shuffled.filter((c) => c.trajectory === "declining");
    const rising = shuffled.filter((c) => c.trajectory === "rising");
    const ordered = [...declining, ...rising];

    for (let i = 0; i < Math.min(commentsPerSnapshot, ordered.length); i++) {
      const c = ordered[i];
      selected.push({
        snapshot_id: snap.snapshot_id,
        email: c.person.email,
        team_id: c.team.id,
        timestamp: randDate(rng, new Date(snap.scheduled_for), snapDate).toISOString(),
        driver_id: c.driver_id,
        driver_name: c.driver_name,
        trajectory: c.trajectory,
        magnitude: c.magnitude,
        scenario_name: c.scenario.name,
        team_name: c.team.name,
        person_level: c.person.level,
        person_discipline: c.person.discipline,
      });
    }

    commentKeys.push(...selected);
  }

  return commentKeys;
}

/**
 * Generate quarterly roster snapshots for Summit trajectory.
 * Simulates roster changes (hires, departures, promotions, transfers)
 * between quarters.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} snapshots
 * @returns {object[]}
 */
function generateRosterSnapshots(ast, rng, people, teams, snapshots) {
  if (snapshots.length === 0) return [];

  const rosterSnapshots = [];
  // Start with current roster as baseline and work through quarters
  let currentRoster = people.map((p) => ({
    email: p.email,
    name: p.name,
    discipline: p.discipline,
    level: p.level,
    track: p.track || null,
    team_id: p.team_id,
    manager_email: p.manager_email,
  }));

  const levelOrder = ["L1", "L2", "L3", "L4", "L5"];
  const namePool = people.map((p) => p.name);
  let hireCounter = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const quarter = snap.snapshot_id.replace("snap_", "");
    const changes = [];

    if (i > 0) {
      // Simulate departures (0-2 per quarter)
      const departureCount = rng.randomInt(0, 2);
      for (let d = 0; d < departureCount && currentRoster.length > 10; d++) {
        const idx = rng.randomInt(0, currentRoster.length - 1);
        const departed = currentRoster[idx];
        changes.push({ type: "depart", name: departed.name, email: departed.email, team_id: departed.team_id });
        currentRoster.splice(idx, 1);
      }

      // Simulate hires (1-3 per quarter)
      const hireCount = rng.randomInt(1, 3);
      for (let h = 0; h < hireCount; h++) {
        hireCounter++;
        const team = rng.pick(teams);
        const level = rng.pick(["L1", "L1", "L2", "L2", "L3"]);
        const discipline = rng.pick([
          "software_engineering",
          "software_engineering",
          "data_engineering",
        ]);
        const email = `hire_${hireCounter}@${ast.domain || "example.com"}`;
        const name = `NewHire_${hireCounter}`;
        const manager = currentRoster.find(
          (p) => p.team_id === team.id && people.find((op) => op.email === p.email)?.is_manager,
        );

        const hire = {
          email,
          name,
          discipline,
          level,
          track: null,
          team_id: team.id,
          manager_email: manager?.email || null,
        };
        currentRoster.push(hire);
        changes.push({ type: "join", name, email, team_id: team.id });
      }

      // Simulate promotions (0-2 per quarter)
      const promotionCount = rng.randomInt(0, 2);
      for (let p = 0; p < promotionCount; p++) {
        const promotable = currentRoster.filter((r) => {
          const idx = levelOrder.indexOf(r.level);
          return idx >= 0 && idx < levelOrder.length - 1;
        });
        if (promotable.length === 0) continue;
        const person = rng.pick(promotable);
        const oldLevel = person.level;
        const newLevel = levelOrder[levelOrder.indexOf(oldLevel) + 1];
        person.level = newLevel;
        changes.push({
          type: "promote",
          name: person.name,
          email: person.email,
          from: oldLevel,
          to: newLevel,
        });
      }

      // Simulate transfers (0-1 per quarter)
      if (rng.random() > 0.6) {
        const transferable = currentRoster.filter(
          (r) => !people.find((op) => op.email === r.email)?.is_manager,
        );
        if (transferable.length > 0) {
          const person = rng.pick(transferable);
          const otherTeams = teams.filter((t) => t.id !== person.team_id);
          if (otherTeams.length > 0) {
            const newTeam = rng.pick(otherTeams);
            const oldTeamId = person.team_id;
            person.team_id = newTeam.id;
            const newManager = currentRoster.find(
              (p) =>
                p.team_id === newTeam.id &&
                people.find((op) => op.email === p.email)?.is_manager,
            );
            person.manager_email = newManager?.email || person.manager_email;
            changes.push({
              type: "transfer",
              name: person.name,
              email: person.email,
              from_team: oldTeamId,
              to_team: newTeam.id,
            });
          }
        }
      }
    }

    rosterSnapshots.push({
      quarter,
      snapshot_id: snap.snapshot_id,
      members: currentRoster.length,
      roster: currentRoster.map((r) => ({ ...r })),
      changes,
    });
  }

  return rosterSnapshots;
}

/**
 * Derive project teams with allocation for Summit what-if scenarios.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @returns {object[]}
 */
function deriveProjectTeams(ast, rng, people, teams) {
  const projectTeams = [];

  for (const project of ast.projects) {
    const projectTeamIds = project.teams || [];
    const members = [];

    for (const teamId of projectTeamIds) {
      const teamPeople = people.filter((p) => p.team_id === teamId);
      // Select a subset of team members for the project
      const count = Math.max(2, Math.round(teamPeople.length * 0.6));
      const selected = rng.shuffle([...teamPeople]).slice(0, count);

      for (const person of selected) {
        // Assign allocation: 0.2-1.0, weighted toward full-time
        const allocation =
          projectTeamIds.length > 1 && rng.random() > 0.5
            ? Math.round(rng.random() * 0.6 * 10 + 4) / 10 // 0.4-1.0
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

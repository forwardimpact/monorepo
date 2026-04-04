/**
 * Initiative and scorecard derivation for activity data.
 *
 * @module libuniverse/engine/activity-initiatives
 */

/**
 * Compute initiative priority from magnitude and direction.
 * @param {boolean} isDeclining
 * @param {number} magnitude
 * @returns {number}
 */
function computePriority(isDeclining, magnitude) {
  if (isDeclining) {
    if (magnitude <= -6) return 0;
    if (magnitude <= -4) return 1;
    return 2;
  }
  return magnitude >= 5 ? 3 : 4;
}

/**
 * Build scorecard checks from driver skills.
 * @param {string} scorecardId
 * @param {string[]} skills
 * @returns {object[]}
 */
function buildChecks(scorecardId, skills) {
  return (skills || []).map((skillId, i) => ({
    id: `chk_${scorecardId}_${i}`,
    name: skillId.replace(/_/g, " "),
    ordering: i,
    published: true,
    level: {
      id: `lvl_${i % 3}`,
      name: ["Red", "Yellow", "Green"][i % 3],
    },
  }));
}

const SCORECARD_LEVELS = [
  { id: "lvl_0", name: "Red", rank: 1, color: "#dc2626" },
  { id: "lvl_1", name: "Yellow", rank: 2, color: "#eab308" },
  { id: "lvl_2", name: "Green", rank: 3, color: "#16a34a" },
];

/**
 * Build a single initiative from a scenario affect and driver.
 */
function buildInitiative(params) {
  const {
    counter,
    isDeclining,
    driver,
    team,
    scenario,
    scorecardId,
    scorecardName,
    dx,
    checks,
    people,
    project,
  } = params;

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

  const passedChecks = Math.round((pctComplete / 100) * checks.length);
  const priority = computePriority(isDeclining, dx.magnitude);

  const completeBy = new Date(endDate);
  completeBy.setMonth(completeBy.getMonth() + 3);

  const manager = people.find((p) => p.team_id === team.id && p.is_manager);
  const ownerPerson = manager || people.find((p) => p.team_id === team.id);

  const remainingDevDays = Math.round(
    ((100 - pctComplete) / 100) * totalDays * 0.3,
  );

  const tags = [
    { value: project?.type || "program", color: "#6366f1" },
    { value: dx.driver_id, color: "#8b5cf6" },
  ];
  if (isDeclining) tags.push({ value: "urgent", color: "#ef4444" });

  return {
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
      : {
          id: "usr_unknown",
          name: "Unknown",
          email: "unknown@example.com",
        },
    tags,
    _scenario_id: scenario.id,
    _team_id: team.id,
    _driver_id: dx.driver_id,
    _trajectory: dx.trajectory,
  };
}

/**
 * Derive initiatives and scorecards from projects and scenarios.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} _snapshots
 * @returns {{ scorecards: object[], initiatives: object[] }}
 */
export function deriveInitiatives(ast, rng, people, teams, _snapshots) {
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

        const checks = buildChecks(scorecardId, driver.skills);

        scorecards.push({
          id: scorecardId,
          name: scorecardName,
          description: `Scorecard tracking ${driver.name.toLowerCase()} for ${team.name}`,
          type: "LEVEL",
          published: true,
          checks,
          levels: SCORECARD_LEVELS,
          tags: [
            {
              value: isDeclining ? "remediation" : "improvement",
              color: isDeclining ? "#dc2626" : "#16a34a",
            },
          ],
        });

        initiatives.push(
          buildInitiative({
            counter,
            isDeclining,
            driver,
            team,
            scenario,
            scorecardId,
            scorecardName,
            dx,
            checks,
            people,
            project,
          }),
        );
      }
    }
  }

  return { scorecards, initiatives };
}

/**
 * Comment key generation for activity data.
 *
 * @module libuniverse/engine/activity-comments
 */

/** @param {import('./rng.js').SeededRNG} rng @param {Date} start @param {Date} end */
function randDate(rng, start, end) {
  return new Date(
    start.getTime() + rng.random() * (end.getTime() - start.getTime()),
  );
}

/**
 * Find scenarios active during a snapshot date.
 * @param {object[]} scenarios
 * @param {Date} snapDate
 * @returns {object[]}
 */
function findActiveScenarios(scenarios, snapDate) {
  return scenarios.filter((scenario) => {
    const start = new Date(scenario.timerange_start + "-01");
    const end = new Date(scenario.timerange_end + "-28");
    return snapDate >= start && snapDate <= end;
  });
}

/**
 * Collect candidates from active scenarios for comment generation.
 * @param {object[]} activeScenarios
 * @param {object[]} people
 * @param {object[]} teams
 * @param {Map<string, object>} driverMap
 * @returns {object[]}
 */
function collectCandidates(activeScenarios, people, teams, driverMap) {
  const candidates = [];
  for (const scenario of activeScenarios) {
    for (const affect of scenario.affects) {
      const team = teams.find((t) => t.id === affect.team_id);
      if (!team) continue;
      const teamPeople = people.filter((p) => p.team_id === team.id);

      for (const person of teamPeople) {
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
  return candidates;
}

/**
 * Generate comment metadata for LLM prose generation.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} snapshots
 * @returns {object[]}
 */
export function generateCommentKeys(ast, rng, people, teams, snapshots) {
  const commentsPerSnapshot = ast.snapshots?.comments_per_snapshot || 0;
  if (commentsPerSnapshot === 0) return [];

  const commentKeys = [];
  const driverMap = new Map(
    (ast.framework?.drivers || []).map((d) => [d.id, d]),
  );

  for (const snap of snapshots) {
    const snapDate = new Date(snap.completed_at);
    const activeScenarios = findActiveScenarios(ast.scenarios, snapDate);
    if (activeScenarios.length === 0) continue;

    const candidates = collectCandidates(
      activeScenarios,
      people,
      teams,
      driverMap,
    );

    const shuffled = rng.shuffle([...candidates]);
    const declining = shuffled.filter((c) => c.trajectory === "declining");
    const rising = shuffled.filter((c) => c.trajectory === "rising");
    const ordered = [...declining, ...rising];

    for (let i = 0; i < Math.min(commentsPerSnapshot, ordered.length); i++) {
      const c = ordered[i];
      commentKeys.push({
        snapshot_id: snap.snapshot_id,
        email: c.person.email,
        team_id: c.team.id,
        timestamp: randDate(
          rng,
          new Date(snap.scheduled_for),
          snapDate,
        ).toISOString(),
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
  }

  return commentKeys;
}

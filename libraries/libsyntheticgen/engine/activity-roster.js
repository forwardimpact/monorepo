/**
 * Roster snapshot generation for activity data.
 *
 * @module libuniverse/engine/activity-roster
 */

const LEVEL_ORDER = ["L1", "L2", "L3", "L4", "L5"];

/**
 * Simulate departures for a quarter.
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} roster
 * @returns {object[]}
 */
function simulateDepartures(rng, roster) {
  const changes = [];
  const departureCount = rng.randomInt(0, 2);
  for (let d = 0; d < departureCount && roster.length > 10; d++) {
    const idx = rng.randomInt(0, roster.length - 1);
    const departed = roster[idx];
    changes.push({
      type: "depart",
      name: departed.name,
      email: departed.email,
      team_id: departed.team_id,
    });
    roster.splice(idx, 1);
  }
  return changes;
}

/**
 * Simulate hires for a quarter.
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} roster
 * @param {object[]} teams
 * @param {object[]} people - original people for manager lookup
 * @param {string} domain
 * @param {{ value: number }} hireCounter
 * @returns {object[]}
 */
function simulateHires(rng, roster, teams, people, domain, hireCounter) {
  const changes = [];
  const hireCount = rng.randomInt(1, 3);
  for (let h = 0; h < hireCount; h++) {
    hireCounter.value++;
    const team = rng.pick(teams);
    const level = rng.pick(["L1", "L1", "L2", "L2", "L3"]);
    const discipline = rng.pick([
      "software_engineering",
      "software_engineering",
      "data_engineering",
    ]);
    const email = `hire_${hireCounter.value}@${domain || "example.com"}`;
    const name = `NewHire_${hireCounter.value}`;
    const manager = roster.find(
      (p) =>
        p.team_id === team.id &&
        people.find((op) => op.email === p.email)?.is_manager,
    );

    roster.push({
      email,
      name,
      discipline,
      level,
      track: null,
      team_id: team.id,
      manager_email: manager?.email || null,
    });
    changes.push({ type: "join", name, email, team_id: team.id });
  }
  return changes;
}

/**
 * Simulate promotions for a quarter.
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} roster
 * @returns {object[]}
 */
function simulatePromotions(rng, roster) {
  const changes = [];
  const promotionCount = rng.randomInt(0, 2);
  for (let p = 0; p < promotionCount; p++) {
    const promotable = roster.filter((r) => {
      const idx = LEVEL_ORDER.indexOf(r.level);
      return idx >= 0 && idx < LEVEL_ORDER.length - 1;
    });
    if (promotable.length === 0) continue;
    const person = rng.pick(promotable);
    const oldLevel = person.level;
    const newLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(oldLevel) + 1];
    person.level = newLevel;
    changes.push({
      type: "promote",
      name: person.name,
      email: person.email,
      from: oldLevel,
      to: newLevel,
    });
  }
  return changes;
}

/**
 * Simulate transfers for a quarter.
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} roster
 * @param {object[]} teams
 * @param {object[]} people
 * @returns {object[]}
 */
function simulateTransfers(rng, roster, teams, people) {
  const changes = [];
  if (rng.random() <= 0.6) return changes;

  const transferable = roster.filter(
    (r) => !people.find((op) => op.email === r.email)?.is_manager,
  );
  if (transferable.length === 0) return changes;

  const person = rng.pick(transferable);
  const otherTeams = teams.filter((t) => t.id !== person.team_id);
  if (otherTeams.length === 0) return changes;

  const newTeam = rng.pick(otherTeams);
  const oldTeamId = person.team_id;
  person.team_id = newTeam.id;
  const newManager = roster.find(
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
  return changes;
}

/**
 * Generate quarterly roster snapshots for Summit trajectory.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @param {object[]} snapshots
 * @returns {object[]}
 */
export function generateRosterSnapshots(ast, rng, people, teams, snapshots) {
  if (snapshots.length === 0) return [];

  const rosterSnapshots = [];
  let currentRoster = people.map((p) => ({
    email: p.email,
    name: p.name,
    discipline: p.discipline,
    level: p.level,
    track: p.track || null,
    team_id: p.team_id,
    manager_email: p.manager_email,
  }));

  const hireCounter = { value: 0 };

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const quarter = snap.snapshot_id.replace("snap_", "");
    let changes = [];

    if (i > 0) {
      changes = [
        ...simulateDepartures(rng, currentRoster),
        ...simulateHires(
          rng,
          currentRoster,
          teams,
          people,
          ast.domain,
          hireCounter,
        ),
        ...simulatePromotions(rng, currentRoster),
        ...simulateTransfers(rng, currentRoster, teams, people),
      ];
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

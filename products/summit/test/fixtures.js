import { join } from "node:path";

import { memoizeAsync } from "@forwardimpact/libmock";
import { createDataLoader } from "@forwardimpact/map/loader";

import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");

/**
 * Loads the shared starter standard fixture (map data + agent data) once per
 * process via `memoizeAsync`. Hoisting it here keeps Summit test files from
 * re-parsing this directory from YAML on every `test(...)` case.
 *
 * @returns {Promise<{ data: object, agentData: object }>}
 */
export function loadStarterData() {
  return memoizeAsync("summit:starter-data", async () => {
    const loader = createDataLoader();
    const [data, agentData] = await Promise.all([
      loader.loadAllData(FIXTURE_DATA),
      loader.loadAgentData(FIXTURE_DATA),
    ]);
    return { data, agentData };
  });
}

/**
 * Shared roster fixture used across summit aggregation tests. Shape:
 * - reporting team `platform` — Alice (J060+platform), Bob (J060), Carol
 *   (J040+platform)
 * - project `migration-q2` — Bob @ 0.6, External (J060) @ 1.0
 *
 * Proficiency math under the starter standard:
 * - software_engineering has task_completion as its CORE skill,
 *   planning as SUPPORTING, incident_response as BROAD.
 * - J060 base proficiencies: core=working, supporting=foundational,
 *   broad=awareness.
 * - J040 base proficiencies: core=foundational, supporting=awareness,
 *   broad=awareness.
 * - platform track modifies reliability: +1 and delivery: -1. Because
 *   task_completion/planning live in delivery, a platform member loses one
 *   step in those; reliability (incident_response) gains one capped by the
 *   level's max.
 *
 * So at J060 without a track, task_completion = working (working+).
 * At J060 with platform, task_completion = foundational (below working).
 *
 * Fixture below lets the reporting team have one working+ holder (Bob) and
 * the project team have two working+ holders (Bob + External) via J060
 * without the platform track.
 */
export const FIXTURE_ROSTER = `
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software_engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software_engineering
        level: J060
    - name: Carol
      email: carol@example.com
      job:
        discipline: software_engineering
        level: J040
        track: platform

projects:
  migration-q2:
    - email: bob@example.com
      allocation: 0.6
    - name: External
      job:
        discipline: software_engineering
        level: J060
      allocation: 1.0
`;

/**
 * Resolves a team, computes coverage, and detects risks in one shot — the
 * "snapshot" pattern repeated across compare/what-if tests.
 *
 * @param {object} roster - Parsed roster.
 * @param {object} data - Starter standard map data.
 * @param {string} teamId - Reporting team id to resolve.
 * @returns {{ resolved: object, coverage: object, risks: object }}
 */
export function snapshot(roster, data, teamId) {
  const resolved = resolveTeam(roster, data, { teamId });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}

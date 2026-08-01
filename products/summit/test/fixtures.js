import { join } from "node:path";

import { memoizeAsync } from "@forwardimpact/libmock";
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";

const FIXTURE_DATA = join(import.meta.dirname, "fixtures", "map-data");
// The fixture loader reads the starter standard from disk, so it wires a real
// createDefaultRuntime() into the Map data loader.
const runtime = createDefaultRuntime();

/**
 * Loads the shared fixture for the starter standard (map data + agent data)
 * once per process with `memoizeAsync`. It sits here so Summit test files do
 * not re-parse this directory from YAML on every `test(...)` case.
 *
 * @returns {Promise<{ data: object, agentData: object }>}
 */
export function loadStarterData() {
  return memoizeAsync("summit:starter-data", async () => {
    const loader = createDataLoader(runtime);
    const [data, agentData] = await Promise.all([
      loader.loadAllData(FIXTURE_DATA),
      loader.loadAgentData(FIXTURE_DATA),
    ]);
    return { data, agentData };
  });
}

/**
 * Shared roster fixture for the summit aggregation tests. Shape:
 * - reporting team `platform` — Alice (J060+platform), Bob (J060), Carol
 *   (J040+platform)
 * - project `migration-q2` — Bob @ 0.6, External (J060) @ 1.0
 *
 * Proficiency math under the starter standard:
 * - software-engineering has task-completion as its CORE skill,
 *   planning as SUPPORTING, incident-response as BROAD.
 * - J060 base proficiencies: core=working, supporting=foundational,
 *   broad=awareness.
 * - J040 base proficiencies: core=foundational, supporting=awareness,
 *   broad=awareness.
 * - platform track modifies reliability: +1 and delivery: -1. Because
 *   task-completion/planning live in delivery, a platform member loses one
 *   step in those. Reliability (incident-response) gains one step, and the
 *   level's max caps that gain.
 *
 * So at J060 without a track, task-completion = working (working+).
 * At J060 with platform, task-completion = foundational (below working).
 *
 * The fixture below gives the reporting team one working+ holder (Bob).
 * It gives the project team two working+ holders (Bob + External). Both
 * counts come from J060 without the platform track.
 */
export const FIXTURE_ROSTER = `
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software-engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software-engineering
        level: J060
    - name: Carol
      email: carol@example.com
      job:
        discipline: software-engineering
        level: J040
        track: platform

projects:
  migration-q2:
    - email: bob@example.com
      allocation: 0.6
    - name: External
      job:
        discipline: software-engineering
        level: J060
      allocation: 1.0
`;

/**
 * Resolves a team, computes coverage, and detects risks in one shot. The
 * compare and what-if tests repeat this "snapshot" pattern.
 *
 * @param {object} roster - Parsed roster.
 * @param {object} data - Map data for the starter standard.
 * @param {string} teamId - Reporting team id to resolve.
 * @returns {{ resolved: object, coverage: object, risks: object }}
 */
export function snapshot(roster, data, teamId) {
  const resolved = resolveTeam(roster, data, { teamId });
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}

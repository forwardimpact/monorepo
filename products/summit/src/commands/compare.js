/**
 * `fit-summit compare <team1> <team2>` — diff two teams' coverage
 * and risks snapshots. Reuses diffCoverage/diffRisks from Part 04.
 */

import { loadRoster } from "../roster/index.js";
import { computeCoverage, resolveTeam } from "../aggregation/coverage.js";
import { detectRisks } from "../aggregation/risks.js";
import { diffCoverage, diffRisks } from "../aggregation/what-if.js";
import { TeamNotFoundError } from "../aggregation/errors.js";
import { resolveAudience, withAudienceFilter } from "../lib/audience.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { compareToText } from "../formatters/compare/text.js";
import { compareToJson } from "../formatters/compare/json.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runCompareCommand({ data, args, options }) {
  const format = resolveFormat(options);
  const audience = resolveAudience(options);

  const [leftId, rightId] = args;
  if (!leftId || !rightId) {
    throw new Error(
      "summit: compare requires two team ids. Usage: fit-summit compare <team1> <team2>.",
    );
  }

  const roster = await loadRoster(getRosterSource(options));

  const left = snapshotTeam(roster, data, leftId);
  const right = snapshotTeam(roster, data, rightId);

  const coverageDiff = diffCoverage(left.coverage, right.coverage);
  const riskDiff = diffRisks(left.risks, right.risks);

  const leftFiltered = withAudienceFilter(left.coverage, audience);
  const rightFiltered = withAudienceFilter(right.coverage, audience);

  if (format === Format.JSON) {
    process.stdout.write(
      JSON.stringify(
        compareToJson({
          left: leftFiltered,
          right: rightFiltered,
          coverageDiff,
          riskDiff,
        }),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  process.stdout.write(
    compareToText({
      left: leftFiltered,
      right: rightFiltered,
      coverageDiff,
      riskDiff,
    }),
  );
}

function snapshotTeam(roster, data, teamId) {
  let resolved;
  try {
    resolved = resolveTeam(roster, data, { teamId });
  } catch (e) {
    if (e instanceof TeamNotFoundError) {
      throw new Error(`summit: ${e.message}`, { cause: e });
    }
    throw e;
  }
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}

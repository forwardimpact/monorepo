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
export async function runCompareCommand({
  data,
  args,
  options,
  config,
  runtime,
}) {
  const format = resolveFormat(options);
  const audience = resolveAudience(options);

  const leftTarget = parseCompareTarget(args[0], options, "left-project");
  const rightTarget = parseCompareTarget(args[1], options, "right-project");

  const roster = await loadRoster({
    ...getRosterSource(options, config),
    fs: runtime.fs,
  });

  const left = snapshotTeam(roster, data, leftTarget);
  const right = snapshotTeam(roster, data, rightTarget);

  const coverageDiff = diffCoverage(left.coverage, right.coverage);
  const riskDiff = diffRisks(left.risks, right.risks);

  const leftFiltered = withAudienceFilter(left.coverage, audience);
  const rightFiltered = withAudienceFilter(right.coverage, audience);

  if (format === Format.JSON) {
    runtime.proc.stdout.write(
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
  runtime.proc.stdout.write(
    compareToText({
      left: leftFiltered,
      right: rightFiltered,
      coverageDiff,
      riskDiff,
    }),
  );
}

/**
 * Parse one side of a `compare` target. Each side can be a positional
 * team id, or a `--left-project` / `--right-project` flag pointing at a
 * project team in the roster file.
 */
function parseCompareTarget(positional, options, projectOptionKey) {
  const projectId = options[projectOptionKey];
  if (projectId) return { projectId };
  if (!positional) {
    throw new Error(
      "summit: compare requires two team ids (or --left-project / --right-project for project teams). Usage: fit-summit compare <team1> <team2>.",
    );
  }
  return { teamId: positional };
}

function snapshotTeam(roster, data, target) {
  let resolved;
  try {
    resolved = resolveTeam(roster, data, target);
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

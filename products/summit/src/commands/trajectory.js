/**
 * `fit-summit trajectory <team>` — show how team capability coverage
 * evolved over calendar quarters.
 *
 * This part only implements the git-history source. Map historical
 * snapshots are a future extension — when the --roster flag is not
 * provided, the handler prints the "not yet supported" message from
 * spec.md:522–524.
 */

import { dirname, relative, resolve } from "node:path";

import { parseRosterYaml } from "../roster/yaml.js";
import {
  bucketCommitsByQuarter,
  computeTrajectory,
} from "../aggregation/trajectory.js";
import {
  GitUnavailableError,
  listCommits,
  showFileAt,
} from "../git/history.js";
import { Format, resolveFormat } from "../lib/cli.js";
import { trajectoryToText } from "../formatters/trajectory/text.js";
import { trajectoryToJson } from "../formatters/trajectory/json.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runTrajectoryCommand({ data, args, options }) {
  const format = resolveFormat(options);
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: trajectory requires a team id. Usage: fit-summit trajectory <team>.",
    );
  }

  if (!options.roster) {
    process.stdout.write(
      "  Historical roster data not available. Showing current-state only. Trajectory requires quarterly roster snapshots in Map or version-controlled summit.yaml.\n",
    );
    return;
  }

  if (options.evidenced) {
    process.stdout.write(
      "  Evidence on trajectory is not yet supported. Historical evidence snapshots would require new Map infrastructure. Run `fit-summit trajectory <team>` without --evidenced to see derivation-only trajectory.\n",
    );
    return;
  }

  const quarters = Math.max(1, Number(options.quarters ?? 4));
  const absolute = resolve(options.roster);
  const cwd = dirname(absolute);
  const relativePath = relative(cwd, absolute);

  let commits;
  try {
    commits = await listCommits(relativePath, { cwd });
  } catch (e) {
    if (e instanceof GitUnavailableError) {
      process.stdout.write(`  ${e.message}\n  Showing current-state only.\n`);
      return;
    }
    throw e;
  }

  if (commits.length === 0) {
    process.stdout.write(
      "  Historical roster data not available. Showing current-state only.\n",
    );
    return;
  }

  const buckets = bucketCommitsByQuarter(commits, quarters);
  const historicalRosters = await loadHistoricalRosters(
    buckets,
    relativePath,
    cwd,
  );

  const trajectory = computeTrajectory({
    historicalRosters,
    teamId,
    data,
  });

  if (format === Format.JSON) {
    process.stdout.write(
      JSON.stringify(trajectoryToJson(trajectory), null, 2) + "\n",
    );
    return;
  }
  process.stdout.write(trajectoryToText(trajectory));
}

async function loadHistoricalRosters(buckets, relativePath, cwd) {
  const out = [];
  for (const bucket of buckets) {
    try {
      const yaml = await showFileAt(bucket.sha, relativePath, { cwd });
      const roster = parseRosterYaml(yaml);
      out.push({ quarter: bucket.quarter, roster });
    } catch (e) {
      // Skip quarters whose historical file cannot be parsed.
      process.stderr.write(
        `summit: skipping quarter ${bucket.quarter} — ${e.message}\n`,
      );
    }
  }
  return out;
}

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
  getRepoRoot,
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
export async function runTrajectoryCommand({ data, args, options, runtime }) {
  const format = resolveFormat(options);
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: trajectory requires a team id. Usage: fit-summit trajectory <team>.",
    );
  }

  if (!options.roster) {
    runtime.proc.stdout.write(
      "  Historical roster data not available. Showing current-state only. Trajectory requires quarterly roster snapshots in Map or version-controlled summit.yaml.\n",
    );
    return;
  }

  if (options.evidenced) {
    runtime.proc.stdout.write(
      "  Evidence on trajectory is not yet supported. Historical evidence snapshots would require new Map infrastructure. Run `fit-summit trajectory <team>` without --evidenced to see derivation-only trajectory.\n",
    );
    return;
  }

  const quarters = Math.max(1, Number(options.quarters ?? 4));
  const absolute = resolve(options.roster);
  const cwd = dirname(absolute);

  const { subprocess } = runtime;
  let repoRoot;
  try {
    repoRoot = await getRepoRoot({ cwd, subprocess });
  } catch (e) {
    if (e instanceof GitUnavailableError) {
      runtime.proc.stdout.write(
        `  ${e.message}\n  Showing current-state only.\n`,
      );
      return;
    }
    throw e;
  }

  // `git show <sha>:<path>` interprets <path> as repo-root-relative,
  // so compute the path from the repo root, not from the roster's dir.
  const relativePath = relative(repoRoot, absolute);

  let commits;
  try {
    commits = await listCommits(relativePath, { cwd: repoRoot, subprocess });
  } catch (e) {
    if (e instanceof GitUnavailableError) {
      runtime.proc.stdout.write(
        `  ${e.message}\n  Showing current-state only.\n`,
      );
      return;
    }
    throw e;
  }

  if (commits.length === 0) {
    runtime.proc.stdout.write(
      "  Historical roster data not available. Showing current-state only.\n",
    );
    return;
  }

  const buckets = bucketCommitsByQuarter(commits, quarters);
  const historicalRosters = await loadHistoricalRosters(
    buckets,
    relativePath,
    repoRoot,
    runtime,
  );

  const trajectory = computeTrajectory({
    historicalRosters,
    teamId,
    data,
  });

  if (format === Format.JSON) {
    runtime.proc.stdout.write(
      JSON.stringify(trajectoryToJson(trajectory), null, 2) + "\n",
    );
    return;
  }
  runtime.proc.stdout.write(trajectoryToText(trajectory));
}

async function loadHistoricalRosters(buckets, relativePath, cwd, runtime) {
  const { subprocess } = runtime;
  const out = [];
  for (const bucket of buckets) {
    try {
      const yaml = await showFileAt(bucket.sha, relativePath, {
        cwd,
        subprocess,
      });
      const roster = parseRosterYaml(yaml);
      out.push({ quarter: bucket.quarter, roster });
    } catch (e) {
      // Skip quarters whose historical file cannot be parsed.
      runtime.proc.stderr.write(
        `summit: skipping quarter ${bucket.quarter} — ${e.message}\n`,
      );
    }
  }
  return out;
}

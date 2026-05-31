/**
 * `fit-summit validate` — validate the roster against Map standard data.
 *
 * Loads the roster, runs schema validation, prints each error, and exits
 * with status 1 when any errors are found. Warnings do not fail.
 */

import { loadRoster, validateRosterAgainstStandard } from "../roster/index.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";

/**
 * @param {object} params
 * @param {object} params.data - Loaded Map standard data.
 * @param {object} params.options - Parsed CLI options.
 */
export async function runValidateCommand({ data, options, config, runtime }) {
  const format = resolveFormat(options);
  const roster = await loadRoster({
    ...getRosterSource(options, config),
    fs: runtime.fs,
  });
  const result = validateRosterAgainstStandard(roster, data);

  if (format === Format.JSON) {
    runtime.proc.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.errors.length > 0) runtime.proc.exitCode = 1;
    return;
  }

  if (result.errors.length === 0) {
    runtime.proc.stdout.write(
      `  Roster is valid. ${countMembers(roster)} members across ${roster.teams.size} teams.\n`,
    );
    return;
  }

  runtime.proc.stdout.write("  Roster validation failed:\n\n");
  for (const issue of result.errors) {
    runtime.proc.stdout.write(`    [${issue.code}] ${issue.message}\n`);
  }
  runtime.proc.stdout.write("\n");
  runtime.proc.exitCode = 1;
}

function countMembers(roster) {
  let total = 0;
  for (const team of roster.teams.values()) total += team.members.length;
  return total;
}

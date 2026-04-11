/**
 * `fit-summit validate` — validate the roster against Map framework data.
 *
 * Loads the roster, runs schema validation, prints each error, and exits
 * with status 1 when any errors are found. Warnings do not fail.
 */

import { loadRoster, validateRosterAgainstFramework } from "../roster/index.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";

/**
 * @param {object} params
 * @param {object} params.data - Loaded Map framework data.
 * @param {object} params.options - Parsed CLI options.
 */
export async function runValidateCommand({ data, options }) {
  const format = resolveFormat(options);
  const roster = await loadRoster(getRosterSource(options));
  const result = validateRosterAgainstFramework(roster, data);

  if (format === Format.JSON) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.errors.length > 0) process.exitCode = 1;
    return;
  }

  if (result.errors.length === 0) {
    process.stdout.write(
      `  Roster is valid. ${countMembers(roster)} members across ${roster.teams.size} teams.\n`,
    );
    return;
  }

  process.stdout.write("  Roster validation failed:\n\n");
  for (const issue of result.errors) {
    process.stdout.write(`    [${issue.code}] ${issue.message}\n`);
  }
  process.stdout.write("\n");
  process.exitCode = 1;
}

function countMembers(roster) {
  let total = 0;
  for (const team of roster.teams.values()) total += team.members.length;
  return total;
}

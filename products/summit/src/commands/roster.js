/**
 * `fit-summit roster` — show the current roster as Summit sees it.
 *
 * Loads the roster (Map-sourced or YAML), then prints a plain-text or
 * JSON summary. This is a display command — no analytical aggregation.
 */

import { loadRoster } from "../roster/index.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { rosterToText } from "../formatters/roster/text.js";
import { rosterToJson } from "../formatters/roster/json.js";

/**
 * @param {object} params
 * @param {object} params.data - Loaded Map standard data.
 * @param {object} params.options - Parsed CLI options.
 */
export async function runRosterCommand({ data, options, config, runtime }) {
  const format = resolveFormat(options);
  const roster = await loadRoster({
    ...getRosterSource(options, config),
    fs: runtime.fs,
  });

  if (format === Format.JSON) {
    runtime.proc.stdout.write(
      JSON.stringify(rosterToJson(roster), null, 2) + "\n",
    );
    return;
  }

  runtime.proc.stdout.write(rosterToText(roster, data.levels ?? []));
}

/**
 * Shared advisor-flag parsing for the four session-mode commands. The two
 * flags are identical everywhere: `--advisor-model` (no default — absent
 * means the Advisor tool is not offered) and `--advisor-max-uses`
 * (default 3), which is a usage error without the model flag.
 */

/**
 * Parse `--advisor-model` / `--advisor-max-uses` from parsed option values.
 * @param {object} values - Parsed option values from cli.parse()
 * @returns {{advisorModel: string|undefined, advisorMaxUses: number}}
 */
export function parseAdvisorOptions(values) {
  if (values["advisor-max-uses"] && !values["advisor-model"]) {
    throw new Error("--advisor-max-uses requires --advisor-model");
  }
  return {
    advisorModel: values["advisor-model"] || undefined,
    advisorMaxUses: parseInt(values["advisor-max-uses"] || "3", 10),
  };
}

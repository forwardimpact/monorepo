/**
 * Shared advisor-flag parser for the four session-mode commands. The two
 * flags are identical everywhere: `--advisor-model` and `--advisor-max-uses`.
 * `--advisor-model` has no default. When it is absent, the commands do not
 * offer the Advisor tool. `--advisor-max-uses` defaults to 3. It is a usage
 * error without the model flag.
 */

/**
 * Parse `--advisor-model` / `--advisor-max-uses` from parsed option values.
 * A malformed max-uses raises a usage error. It never falls back silently.
 * NaN would make the budget check (`used >= maxUses`) permanently false. It
 * would disable the code-enforced cap the flag exists to guarantee.
 * @param {object} values - Parsed option values from cli.parse()
 * @returns {{advisorModel: string|undefined, advisorMaxUses: number}}
 */
export function parseAdvisorOptions(values) {
  if (values["advisor-max-uses"] && !values["advisor-model"]) {
    throw new Error("--advisor-max-uses requires --advisor-model");
  }
  const advisorMaxUses = parseInt(values["advisor-max-uses"] || "3", 10);
  if (Number.isNaN(advisorMaxUses) || advisorMaxUses < 1) {
    throw new Error("--advisor-max-uses must be a positive integer");
  }
  return {
    advisorModel: values["advisor-model"] || undefined,
    advisorMaxUses,
  };
}

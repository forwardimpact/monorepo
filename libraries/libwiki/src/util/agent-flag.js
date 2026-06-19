/**
 * Resolve the required agent flag from frozen CLI options. Pure — reads no
 * filesystem and no environment, so it runs before any state change. Returns
 * `{ ok: true, agent }` when the flag is present, or
 * `{ ok: false, code: 2, error }` when it is missing, where `error` names the
 * missing flag and shows a corrected example invocation. The error never
 * mentions an environment variable: `libwiki` carries no ambient agent
 * identity, so there is no fallback to offer.
 *
 * @param {Record<string, unknown>} options - The frozen `ctx.options`.
 * @param {{ command: string, flag?: string, example: string }} spec
 *   `command` names the failing subcommand; `flag` is the option key prefix
 *   (`--agent` by default, `--from` for `memo`); `example` is a correct
 *   invocation shown verbatim in the error.
 * @returns {{ ok: true, agent: string } | { ok: false, code: 2, error: string }}
 */
export function requireAgentFlag(
  options,
  { command, flag = "--agent", example },
) {
  const key = flag === "--from" ? "from" : "agent";
  const agent = options[key];
  if (!agent) {
    return {
      ok: false,
      code: 2,
      error: `${command} requires ${flag} <name>; e.g. ${example}`,
    };
  }
  return { ok: true, agent };
}

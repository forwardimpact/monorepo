/**
 * Substrate subcommand dispatch — extracted from `bin/fit-map.js` so the
 * CLI entry point stays under biome's `nursery/noExcessiveLinesPerFile`
 * cap (`biome.json` line 46-49: `maxLines: 530, skipBlankLines: true`).
 * Keeping the `substrate pick` case here (instead of inlining it into
 * `fit-map.js`) preserves headroom under the line cap.
 *
 * Callers pass `{ config, mapClient, cli }` so this module stays
 * dep-free at import time (no Supabase init, no CLI singleton) and
 * stays easy to test if needed.
 */

/**
 * @param {string} subcommand
 * @param {Array<string>} _rest
 * @param {Record<string, string|undefined>} values
 * @param {{ config: object, mapClient: () => Promise<object>, cli: { usageError: (msg: string) => void } }} deps
 * @returns {Promise<number>}
 */
export async function dispatchSubstrate(subcommand, _rest, values, deps) {
  const { config, mapClient, cli } = deps;
  switch (subcommand) {
    case "stage": {
      const { runStageCommand } = await import(
        "../src/commands/substrate-stage.js"
      );
      return runStageCommand({ config, target: values.cwd });
    }
    case "roster": {
      const supabase = await mapClient();
      const { runRosterCommand } = await import(
        "../src/commands/substrate-roster.js"
      );
      return runRosterCommand({
        supabase,
        options: { format: values.format },
      });
    }
    case "pick": {
      const supabase = await mapClient();
      const { runPickCommand } = await import(
        "../src/commands/substrate-pick.js"
      );
      return runPickCommand({
        supabase,
        options: {
          memoryWindow: values["memory-window"],
          format: values.format,
        },
      });
    }
    case "issue": {
      const supabase = await mapClient();
      const { runSubstrateIssueCommand } = await import(
        "../src/commands/substrate-issue.js"
      );
      return runSubstrateIssueCommand({
        supabase,
        config,
        options: {
          email: values.email,
          cwd: values.cwd,
          ttl: values.ttl,
          stash: values.stash,
        },
      });
    }
    default:
      cli.usageError(`unknown substrate subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

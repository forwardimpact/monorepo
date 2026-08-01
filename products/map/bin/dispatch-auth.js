#!/usr/bin/env node

/**
 * Auth subcommand dispatch. This module sits outside `bin/fit-map.js` so the
 * CLI entry point stays under biome's `nursery/noExcessiveLinesPerFile` cap
 * (`biome.json`: `maxLines: 530`). `dispatch-substrate.js` follows the same
 * pattern. The split reclaims the headroom that the
 * `substrate stage --emit-env` option needs.
 *
 * Callers pass `{ config, mapClient, cli, runtime }` so this module stays
 * dep-free at import time. `runtime` is the injected collaborator bag.
 * `bin/fit-map.js` threads it through. That file is the sole construction
 * site.
 */

/**
 * @param {string} subcommand
 * @param {Array<string>} _rest
 * @param {Record<string, string|undefined>} values
 * @param {{ config: object, mapClient: () => Promise<object>, cli: { usageError: (msg: string) => void }, runtime: import('@forwardimpact/libutil/runtime').Runtime }} deps
 * @returns {Promise<number>}
 */
export async function dispatchAuth(subcommand, _rest, values, deps) {
  const { config, mapClient, cli, runtime } = deps;
  switch (subcommand) {
    case "issue": {
      const supabase = await mapClient();
      const { runAuthIssueCommand } = await import(
        "../src/commands/auth-issue.js"
      );
      await runAuthIssueCommand({
        supabase,
        config,
        options: { email: values.email, ttl: values.ttl },
        runtime,
      });
      return 0;
    }
    default:
      cli.usageError(`unknown auth subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

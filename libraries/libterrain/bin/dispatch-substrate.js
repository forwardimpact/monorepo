/**
 * Substrate subcommand dispatch — extracted from `bin/fit-terrain.js` so
 * the CLI entry point stays under biome's `nursery/noExcessiveLinesPerFile`
 * cap. The caller threads `runtime` (the injected collaborator bag) and the
 * parsed option values; this module owns building the script config and the
 * schema-bound client for the stack-facing verbs.
 */

import { createScriptConfig } from "@forwardimpact/libconfig";
import { runSubstrateUp } from "../src/commands/substrate-up.js";
import { runSubstrateInit } from "../src/commands/substrate-init.js";
import { runSubstrateCheck } from "../src/commands/substrate-check.js";
import { runSubstrateProvision } from "../src/commands/substrate-provision.js";
import { runSubstratePick } from "../src/commands/substrate-pick.js";
import { runSubstrateRoster } from "../src/commands/substrate-roster.js";
import { runSubstrateIssue } from "../src/commands/substrate-issue.js";
import { createSubstrateClient } from "../src/substrate/client.js";

/**
 * Build the service-role substrate client from script config. Every
 * stack-facing substrate verb funnels through here; `substrate init` and
 * `substrate up` are offline/bring-up and never touch it.
 */
async function substrateClient() {
  const config = await createScriptConfig("terrain");
  return { config, supabase: createSubstrateClient({ config }) };
}

const HANDLERS = {
  up: (values, runtime) =>
    runSubstrateUp({
      cwd: values.cwd,
      emitEnv: values["emit-env"],
      runtime,
    }),
  init: (values, runtime) => runSubstrateInit({ cwd: values.cwd, runtime }),
  check: async (_values, runtime) => {
    const { supabase } = await substrateClient();
    return runSubstrateCheck({ supabase, runtime });
  },
  provision: async (_values, runtime) => {
    const { supabase } = await substrateClient();
    return runSubstrateProvision({ supabase, runtime });
  },
  pick: async (values, runtime) => {
    const { supabase } = await substrateClient();
    return runSubstratePick({
      supabase,
      options: {
        format: values.format,
        memory: values.memory,
        memoryWindow: values["memory-window"],
      },
      runtime,
    });
  },
  roster: async (values, runtime) => {
    const { supabase } = await substrateClient();
    return runSubstrateRoster({
      supabase,
      options: { format: values.format },
      runtime,
    });
  },
  issue: async (values, runtime) => {
    const { config, supabase } = await substrateClient();
    return runSubstrateIssue({
      supabase,
      config,
      options: {
        email: values.email,
        cwd: values.cwd,
        tokenEnv: values["token-env"],
        ttl: values.ttl,
        stash: values.stash,
      },
      runtime,
    });
  },
};

/**
 * Dispatch one substrate subcommand. Returns the verb's exit code, or
 * `null` when the subcommand is unknown (caller renders the usage error).
 *
 * @param {string} subcommand
 * @param {Record<string, string|boolean|undefined>} values
 * @param {{ runtime: import('@forwardimpact/libutil/runtime').Runtime }} deps
 * @returns {Promise<number|null>}
 */
export async function dispatchSubstrate(subcommand, values, { runtime }) {
  const handler = HANDLERS[subcommand];
  if (!handler) return null;
  return handler(values, runtime);
}

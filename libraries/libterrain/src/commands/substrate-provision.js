/**
 * `fit-terrain substrate provision` — reconcile `auth.users` against the
 * `substrate.people` roster. This command is a thin wrapper over the
 * exported `runProvision` capability. The CLI and consumers that embed the
 * reconciliation (e.g. a staging pipeline) share one implementation.
 */

import { runProvision } from "../substrate/auth-users.js";

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Service-role client bound to the `substrate` schema.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (proc, clock).
 * @returns {Promise<number>}
 */
export async function runSubstrateProvision({ supabase, runtime }) {
  // runProvision throws on failure. A resolved call means success.
  await runProvision({ supabase, runtime });
  return 0;
}

/**
 * `fit-terrain substrate provision` — reconcile `auth.users` against the
 * `substrate.people` roster. Thin wrapper over the exported `runProvision`
 * capability so consumers embedding the reconciliation (e.g. a staging
 * pipeline) and the CLI share one implementation.
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
  // runProvision reports failure by throwing; a resolved call is success.
  await runProvision({ supabase, runtime });
  return 0;
}

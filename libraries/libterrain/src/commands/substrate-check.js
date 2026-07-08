/**
 * `fit-terrain substrate check` — validate a live stack against the
 * Substrate Contract. One column-explicit probe per contract relation
 * (`select(<columns>).limit(1)`, never `select("*")` — PostgREST accepts
 * unknown relations lazily on some error paths, and the explicit column
 * list is what turns a malformed view into a diagnostic naming the missing
 * column). One diagnostic per missing or malformed relation; severity
 * follows the relation's required flag, not the failure kind — a required
 * relation missing **or malformed** exits 1, an optional one reports as
 * info and exits 0 (declared degradation).
 */

import {
  formatError,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";
import { SUBSTRATE_CONTRACT } from "../substrate/contract.js";

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Client bound to the `substrate` schema.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (proc).
 * @returns {Promise<number>}
 */
export async function runSubstrateCheck({ supabase, runtime }) {
  let requiredFailures = 0;
  for (const [name, rel] of Object.entries(SUBSTRATE_CONTRACT.relations)) {
    const { error } = await supabase
      .from(name)
      .select(rel.columns.join(","))
      .limit(1);
    if (!error) {
      runtime.proc.stdout.write(
        formatBullet(`substrate.${name}: ok (${rel.columns.join(", ")})`, 0) +
          "\n",
      );
      continue;
    }
    const diagnostic = `substrate.${name} (${
      rel.required ? "required" : "optional"
    }): ${error.message}`;
    if (rel.required) {
      requiredFailures += 1;
      runtime.proc.stderr.write(formatError(diagnostic) + "\n");
    } else {
      runtime.proc.stdout.write(
        formatBullet(`info: ${diagnostic} — degrades declaredly`, 0) + "\n",
      );
    }
  }
  if (requiredFailures > 0) {
    runtime.proc.stderr.write(
      formatError(
        `substrate check: ${requiredFailures} required relation(s) failed`,
      ) + "\n",
    );
    return 1;
  }
  runtime.proc.stdout.write(
    formatSuccess("Substrate Contract satisfied") + "\n",
  );
  return 0;
}

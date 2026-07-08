/**
 * `fit-terrain substrate roster` — list every invariant-satisfying persona
 * from a contract-conforming substrate. Operator surface over the same
 * persona query as `pick`: default output is an aligned table over the
 * columns an operator reads to pick a persona; `--format json` returns
 * enriched rows. Exits non-zero with a diagnostic on an empty result so
 * the caller can surface the binding constraint.
 */

import { formatTable, formatError } from "@forwardimpact/libcli";
import { findInvariantSatisfyingPersonas } from "../substrate/persona-query.js";
import { loadStory, enrichPersonaRow } from "../substrate/persona-enricher.js";

const TABLE_HEADERS = [
  "email",
  "name",
  "discipline",
  "level",
  "track",
  "team_name",
  "manages_count",
  "parent_email",
];

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Client bound to the `substrate` schema.
 * @param {{format?: string}} [params.options]
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc).
 * @returns {Promise<number>}
 */
export async function runSubstrateRoster({ supabase, options, runtime }) {
  const { personas, diagnostic, applied_invariants } =
    await findInvariantSatisfyingPersonas({ supabase });

  if (!personas.length) {
    runtime.proc.stderr.write(
      formatError(`substrate roster: ${diagnostic ?? "no personas"}`) + "\n",
    );
    return 1;
  }

  const ast = await loadStory(runtime);
  const enriched = personas.map((row) => enrichPersonaRow(row, ast));

  if (options?.format === "json") {
    const payload = {
      personas: enriched,
      selection_metadata: { applied_invariants },
    };
    runtime.proc.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }

  const rows = enriched.map((p) => TABLE_HEADERS.map((h) => p[h]));
  runtime.proc.stdout.write(formatTable(TABLE_HEADERS, rows) + "\n");
  return 0;
}

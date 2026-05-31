/**
 * `fit-map substrate roster` — list invariant-satisfying personas from
 * the seeded substrate as a persona-pick menu for the kata-interview
 * supervisor. Default output is an aligned table over the columns the
 * supervisor reads to pick a persona; `--format json` returns enriched
 * rows carrying every persona-template `## You` field.
 *
 * Read-only verb: queries `organization_people`, `getdx_teams`,
 * `evidence`, `github_artifacts`, `getdx_snapshots`, and
 * `getdx_snapshot_team_scores` via the persona-query helper, then
 * augments each row with three DSL-derived fields (`repos`,
 * `department_name`, `scenario`) from `data/synthetic/story.dsl`.
 * Exits non-zero with a diagnostic on an empty result so the caller can
 * surface the binding constraint to the operator.
 */

import { formatTable, formatError } from "@forwardimpact/libcli";
import { loadStory, enrichPersonaRow } from "../lib/persona-enricher.js";

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
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{format?: string}} params.options
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc).
 * @returns {Promise<number>}
 */
export async function runRosterCommand({ supabase, options, runtime }) {
  const { findInvariantSatisfyingPersonas } = await import(
    "./substrate-persona-query.js"
  );
  const { personas, diagnostic } = await findInvariantSatisfyingPersonas({
    supabase,
  });

  if (!personas.length) {
    runtime.proc.stderr.write(
      formatError(`substrate roster: ${diagnostic ?? "no personas"}`) + "\n",
    );
    return 1;
  }

  const ast = await loadStory(runtime);
  const enriched = personas.map((row) => enrichPersonaRow(row, ast));

  const payload = {
    personas: enriched,
    selection_metadata: {
      signals: ["memory_diversification", "jtbd_role_alignment"],
    },
  };

  if (options?.format === "json") {
    runtime.proc.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }

  const rows = enriched.map((p) => [
    p.email,
    p.name,
    p.discipline,
    p.level,
    p.track,
    p.team_name,
    p.manages_count,
    p.parent_email,
  ]);
  runtime.proc.stdout.write(formatTable(TABLE_HEADERS, rows) + "\n");
  return 0;
}

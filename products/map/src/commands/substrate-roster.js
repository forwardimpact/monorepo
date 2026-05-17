/**
 * `fit-map substrate roster` — list invariant-satisfying personas from
 * the seeded substrate. Used by the kata-interview supervisor to pick
 * a persona before invoking `fit-map substrate issue`.
 *
 * Read-only verb: queries `organization_people`, `evidence`,
 * `github_artifacts`, `getdx_snapshots`, and
 * `getdx_snapshot_team_scores` via the helper, then renders one row per
 * persona. Exits non-zero with a diagnostic on an empty result so the
 * caller can surface the binding constraint to the operator.
 */

import { formatHeader, formatBullet, formatError } from "@forwardimpact/libcli";

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{format?: string}} params.options
 * @returns {Promise<number>}
 */
export async function runRosterCommand({ supabase, options }) {
  const { findInvariantSatisfyingPersonas } = await import(
    "./substrate-persona-query.js"
  );
  const { personas, diagnostic } = await findInvariantSatisfyingPersonas({
    supabase,
  });

  if (!personas.length) {
    process.stderr.write(
      formatError(`substrate roster: ${diagnostic ?? "no personas"}`) + "\n",
    );
    return 1;
  }

  // snapshot_id/item_id are carried per-row on each persona; the
  // kata-interview supervisor reads them off the picked row. The
  // SKILL.md Step 3a documents that shape, so no separate top-level
  // discovery field is exposed here.
  const payload = {
    personas,
    selection_metadata: {
      signals: ["memory_diversification", "jtbd_role_alignment"],
    },
  };

  if (options?.format === "json") {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(
    formatHeader(`Invariant-satisfying personas (${personas.length})`) + "\n\n",
  );
  for (const p of personas) {
    process.stdout.write(
      formatBullet(
        `${p.email} — ${p.name} (${p.discipline}/${p.level}/${p.track ?? "-"}) ` +
          `manages=${p.manages_count} evidence=${p.evidence_count} ` +
          `practice_directs=${p.practice_directs_count}`,
        0,
      ) + "\n",
    );
  }
  return 0;
}

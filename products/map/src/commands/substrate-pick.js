/**
 * `fit-map substrate pick` — return one invariant-satisfying persona
 * diversified against recent picks (kata-interview supervisor's
 * persona-pick move). Appends the picked persona to
 * `wiki/kata-interview/picks.csv` on success so successive invocations
 * return different personas without the supervisor running ad-hoc greps.
 *
 * Exits non-zero when (a) no persona satisfies the substrate invariants,
 * or (b) every qualifying persona appears in the recent-pick window.
 */

import path from "node:path";
import { formatTable, formatError } from "@forwardimpact/libcli";
import { findInvariantSatisfyingPersonas } from "./substrate-persona-query.js";
import { loadStory, enrichPersonaRow } from "../lib/persona-enricher.js";
import { readPickMemory, appendPickMemory } from "../lib/pick-memory.js";

const DEFAULT_MEMORY_WINDOW = 5;

const TEXT_TABLE_HEADERS = [
  "email",
  "name",
  "discipline",
  "level",
  "track",
  "team_name",
  "manages_count",
  "parent_email",
];

function parseMemoryWindow(raw) {
  if (raw == null || raw === "") return DEFAULT_MEMORY_WINDOW;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_MEMORY_WINDOW;
  return n;
}

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{memoryWindow?: string, format?: string}} [params.options]
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc).
 * @param {Record<string,string>} [params.env]
 * @param {string} [params.cwd]
 * @returns {Promise<number>}
 */
export async function runPickCommand({
  supabase,
  options = {},
  runtime,
  env = runtime.proc.env,
  cwd = runtime.proc.cwd(),
}) {
  const { personas, diagnostic } = await findInvariantSatisfyingPersonas({
    supabase,
  });

  if (!personas.length) {
    runtime.proc.stderr.write(
      formatError(`substrate pick: ${diagnostic ?? "no personas"}`) + "\n",
    );
    return 1;
  }

  const memoryPath = path.join(cwd, "wiki/kata-interview/picks.csv");
  const memoryWindow = parseMemoryWindow(options.memoryWindow);
  const recentEmails = await readPickMemory(memoryPath, memoryWindow, runtime);
  const remaining = personas.filter((p) => !recentEmails.has(p.email));

  if (!remaining.length) {
    runtime.proc.stderr.write(
      formatError(
        `substrate pick: no candidate diversifies against last ${memoryWindow} picks`,
      ) + "\n",
    );
    return 1;
  }

  const ast = await loadStory(runtime, cwd);
  const enriched = enrichPersonaRow(remaining[0], ast);

  const payload = {
    personas: [enriched],
    selection_metadata: {
      signals: ["memory_diversification", "jtbd_role_alignment"],
      memory_window: memoryWindow,
    },
  };

  if (options.format === "text") {
    const row = [
      enriched.email,
      enriched.name,
      enriched.discipline,
      enriched.level,
      enriched.track,
      enriched.team_name,
      enriched.manages_count,
      enriched.parent_email,
    ];
    runtime.proc.stdout.write(formatTable(TEXT_TABLE_HEADERS, [row]) + "\n");
  } else {
    runtime.proc.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  }

  try {
    await appendPickMemory(
      memoryPath,
      {
        persona_email: enriched.email,
        run_id: env.GITHUB_RUN_ID ?? "",
      },
      runtime,
    );
  } catch (err) {
    runtime.proc.stderr.write(
      formatError(
        `substrate pick: failed to append ${memoryPath}: ${err.message}`,
      ) + "\n",
    );
    return 1;
  }

  return 0;
}

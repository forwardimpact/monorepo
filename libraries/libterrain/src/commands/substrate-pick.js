/**
 * `fit-terrain substrate pick` — return one invariant-satisfying persona
 * from a contract-conforming substrate. With `--memory <path>` the pick
 * diversifies against the last `--memory-window` picks recorded in that
 * CSV, appending the new pick on success so cross-run diversification
 * carries over; without `--memory` the verb is stateless. Enrichment
 * reads the synthetic story artifacts (`data/synthetic/story.dsl`)
 * resolved upward from the working directory; absent artifacts yield the
 * structural persona fields un-enriched.
 *
 * Exits non-zero when (a) no persona satisfies the applicable invariants,
 * or (b) every qualifying persona appears in the recent-pick window.
 */

import path from "node:path";
import { formatTable, formatError } from "@forwardimpact/libcli";
import { findInvariantSatisfyingPersonas } from "../substrate/persona-query.js";
import { loadStory, enrichPersonaRow } from "../substrate/persona-enricher.js";
import { readPickMemory, appendPickMemory } from "../substrate/pick-memory.js";

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
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Client bound to the `substrate` schema.
 * @param {{memory?: string, memoryWindow?: string, format?: string}} [params.options]
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc).
 * @param {Record<string,string>} [params.env]
 * @param {string} [params.cwd]
 * @returns {Promise<number>}
 */
export async function runSubstratePick({
  supabase,
  options = {},
  runtime,
  env = runtime.proc.env,
  cwd = runtime.proc.cwd(),
}) {
  const { personas, diagnostic, applied_invariants } =
    await findInvariantSatisfyingPersonas({ supabase });

  if (!personas.length) {
    runtime.proc.stderr.write(
      formatError(`substrate pick: ${diagnostic ?? "no personas"}`) + "\n",
    );
    return 1;
  }

  const memoryPath = options.memory ? path.resolve(cwd, options.memory) : null;
  const memoryWindow = parseMemoryWindow(options.memoryWindow);
  const recentEmails = memoryPath
    ? await readPickMemory(memoryPath, memoryWindow, runtime)
    : new Set();
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
      signals: memoryPath
        ? ["memory_diversification", "jtbd_role_alignment"]
        : ["jtbd_role_alignment"],
      memory_window: memoryPath ? memoryWindow : null,
      applied_invariants,
    },
  };

  if (options.format === "text") {
    const row = TEXT_TABLE_HEADERS.map((h) => enriched[h]);
    runtime.proc.stdout.write(formatTable(TEXT_TABLE_HEADERS, [row]) + "\n");
  } else {
    runtime.proc.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  }

  if (memoryPath) {
    try {
      await appendPickMemory(
        memoryPath,
        {
          persona_email: enriched.email,
          // CI run metadata, not a product literal; empty outside GitHub.
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
  }

  return 0;
}

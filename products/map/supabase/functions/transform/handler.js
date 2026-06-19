import { transformAll } from "../_shared/activity/transform/index.js";

/**
 * Run the full transform orchestrator with hosted collaborators.
 *
 * Threads the injected runtime (clock) and, when available, the bundled
 * standard data into the orchestrator. The producer-skipped reason from the
 * bundle loader rides the response so a reader can tell "did not run" from
 * "ran, matched nothing". The `ok` flag keeps the surface's existing
 * people/getdx/github computation; the producer's outcome does not gate it.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clock: { now: () => number } }} runtime
 * @param {() => Promise<{ mapData: object } | { skipped: true, reason: string }>} loadMapData
 * @returns {Promise<object>} Response body.
 */
export async function handleTransform(supabase, runtime, loadMapData) {
  const md = await loadMapData();
  const result = await transformAll(
    supabase,
    runtime,
    md.mapData ? { mapData: md.mapData } : {},
  );
  const ok =
    result.people.errors.length === 0 &&
    result.getdx.errors.length === 0 &&
    result.github.errors.length === 0;
  const evidenceArtifact = md.skipped
    ? { ...result.evidenceArtifact, skipReason: md.reason }
    : result.evidenceArtifact;
  return { ok, ...result, evidenceArtifact };
}

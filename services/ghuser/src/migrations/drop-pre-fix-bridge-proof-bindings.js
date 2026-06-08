const MIGRATION_ID = "1520-drop-pre-fix-bridge-proof-bindings";

/**
 * Drops every binding whose surface is not `github-discussions`. Predicate
 * is independent of the identity-contracts registry's current state — a
 * surface added then removed between binding write and migration is still
 * covered (design § Pre-fix binding migration).
 *
 * @param {object} deps
 * @param {import("../stores.js").BindingStore} deps.bindings
 * @param {import("./index.js").MigrationLedger} deps.migrations
 * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock
 * @param {object} [deps.logger]
 * @returns {Promise<{dropped: number, skipped: boolean}>}
 */
export async function dropPreFixBridgeProofBindings({
  bindings,
  migrations,
  clock,
  logger,
}) {
  if (await migrations.has(MIGRATION_ID)) {
    logger?.info?.("migration", "skip", { id: MIGRATION_ID });
    return { dropped: 0, skipped: true };
  }

  await bindings.loadData();
  let dropped = 0;
  for (const binding of [...bindings.index.values()]) {
    // `binding.id` is `${surface}:${userId}` per `BindingStore.keyOf`
    // (services/ghuser/src/stores.js:30-32). Splitting on the first `:`
    // is safe because current surface vocabularies (`github-discussions`,
    // `msteams`) contain no `:`; a future colon-bearing surface would
    // require a corresponding `keyOf` change (flagged in design §
    // Migration as forward-looking).
    const surface = binding.id.split(":")[0];
    if (surface !== "github-discussions") {
      await bindings.delete(binding.id);
      dropped++;
    }
  }
  await bindings.flush();
  // Marker write is the **last** step. Two failure modes considered:
  //   1. Crash mid-iteration (no marker): next boot re-runs and drops
  //      surviving non-github-discussions rows; safe because re-running
  //      over an already-tombstoned keyspace is a no-op.
  //   2. Crash mid-iteration with marker-first ordering (rejected):
  //      surviving non-github-discussions rows leak indefinitely because
  //      the marker check short-circuits the next boot.
  await migrations.record(MIGRATION_ID, clock.now());
  logger?.info?.("migration", "complete", { id: MIGRATION_ID, dropped });
  return { dropped, skipped: false };
}

/**
 * Initiative impact computation.
 *
 * Pure function operating on already-fetched rows. No Supabase inside.
 */

/**
 * Compute initiative impact by joining completion dates to snapshot score deltas.
 *
 * @param {object} params
 * @param {Array<object>} params.completed - Completed initiatives.
 * @param {Array<object>} params.snapshots - All snapshots (ordered by scheduled_for).
 * @param {Map<string, Map<string, number>>} params.scoresBySnapshot -
 *   snapshotId → Map(scorecardId → score).
 * @returns {Array<{initiative: object, before: number|null, after: number|null, delta: number|null}>}
 */
export function computeInitiativeImpact({
  completed,
  snapshots,
  scoresBySnapshot,
}) {
  const sorted = [...snapshots].sort((a, b) =>
    (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""),
  );
  return completed.map((init) =>
    computeSingleImpact(init, sorted, scoresBySnapshot),
  );
}

/** Compute impact for a single initiative against sorted snapshots. */
function computeSingleImpact(init, sorted, scoresBySnapshot) {
  const nullResult = {
    initiative: init,
    before: null,
    after: null,
    delta: null,
  };

  if (!init.scorecard_id || !init.completed_at) return nullResult;

  const { before, after } = findBoundingSnapshots(sorted, init.completed_at);
  if (!before || !after) return nullResult;

  const beforeScore =
    scoresBySnapshot.get(before.snapshot_id)?.get(init.scorecard_id) ?? null;
  const afterScore =
    scoresBySnapshot.get(after.snapshot_id)?.get(init.scorecard_id) ?? null;

  return {
    initiative: init,
    before: beforeScore,
    after: afterScore,
    delta:
      beforeScore != null && afterScore != null
        ? afterScore - beforeScore
        : null,
  };
}

/** Find the latest snapshot before and earliest snapshot after a date. */
function findBoundingSnapshots(sorted, completedAt) {
  let before = null;
  for (const s of sorted) {
    if ((s.scheduled_for ?? "") <= completedAt) before = s;
    else break;
  }

  const after =
    sorted.find((s) => (s.scheduled_for ?? "") > completedAt) ?? null;

  return { before, after };
}

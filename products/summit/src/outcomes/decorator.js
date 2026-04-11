/**
 * Outcome decorators for growth recommendations.
 *
 * Loads GetDX driver scores from Map's snapshots layer and re-weights
 * growth recommendations within their impact tier. Recommendations
 * whose skill contributes to a poorly-scoring driver surface first.
 */

import {
  getSnapshotScores,
  listSnapshots,
} from "@forwardimpact/map/activity/queries/snapshots";

/**
 * Load the latest GetDX driver scores.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} params
 * @param {object} [params.team]
 * @param {typeof listSnapshots} [params.fetchSnapshots]
 * @param {typeof getSnapshotScores} [params.fetchScores]
 * @returns {Promise<Map<string, object>>}
 */
export async function loadDriverScores(supabase, params = {}) {
  const snaps = params.fetchSnapshots ?? listSnapshots;
  const scores = params.fetchScores ?? getSnapshotScores;
  const snapshots = await snaps(supabase);
  if (!snapshots || snapshots.length === 0) return new Map();
  const latest = snapshots[0];
  const rows = await scores(supabase, latest.id, {
    managerEmail: params.team?.managerEmail,
  });
  const out = new Map();
  for (const row of rows ?? []) {
    out.set(row.item_id ?? row.driver_id ?? row.id, {
      percentile: row.percentile ?? null,
      vsOrg: row.vs_org ?? null,
      vsPrev: row.vs_prev ?? null,
      snapshotId: latest.id,
    });
  }
  return out;
}

/**
 * Build a reverse map of skillId → [driverId] from Map's driver
 * definitions.
 *
 * @param {object} data
 * @returns {Map<string, string[]>}
 */
export function mapSkillsToDrivers(data) {
  const reverse = new Map();
  for (const driver of data.drivers ?? []) {
    for (const skillId of driver.contributingSkills ?? []) {
      if (!reverse.has(skillId)) reverse.set(skillId, []);
      reverse.get(skillId).push(driver.id);
    }
  }
  return reverse;
}

/**
 * Attach `driverContext` to each recommendation and re-sort so that
 * within a tier, gaps tied to a poorly-scoring driver surface first.
 *
 * The impact-tier hierarchy (critical > spof > coverage) is preserved
 * — outcome weighting only breaks ties within a tier.
 *
 * @param {object[]} recommendations
 * @param {Map<string, object>} driverScores
 * @param {object} data
 * @returns {object[]}
 */
export function decorateRecommendationsWithOutcomes(
  recommendations,
  driverScores,
  data,
) {
  const reverse = mapSkillsToDrivers(data);
  const decorated = recommendations.map((rec) => {
    const driverIds = reverse.get(rec.skillId) ?? [];
    let worst = null;
    for (const driverId of driverIds) {
      const score = driverScores.get(driverId);
      if (!score) continue;
      if (
        worst === null ||
        (score.percentile ?? 100) < (worst.percentile ?? 100)
      ) {
        worst = { driverId, ...score };
      }
    }
    return { ...rec, driverContext: worst };
  });

  decorated.sort((a, b) => {
    const impactDiff = impactRank(a.impact) - impactRank(b.impact);
    if (impactDiff !== 0) return impactDiff;
    const aPct = a.driverContext?.percentile ?? 100;
    const bPct = b.driverContext?.percentile ?? 100;
    return aPct - bPct;
  });

  return decorated;
}

function impactRank(impact) {
  if (impact === "critical") return 0;
  if (impact === "spof-reduction") return 1;
  return 2;
}

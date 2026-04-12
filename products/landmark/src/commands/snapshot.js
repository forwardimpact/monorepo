/**
 * `fit-landmark snapshot list|show|trend|compare` — GetDX snapshot views.
 */

import {
  listSnapshots,
  getSnapshotScores,
  getItemTrend,
  getSnapshotComparison,
} from "@forwardimpact/map/activity/queries/snapshots";

import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

/**
 * @param {object} params
 * @param {string[]} params.args
 * @param {object} params.options
 * @param {object} params.mapData
 * @param {object} params.supabase
 * @param {string} params.format
 * @param {object} [params.queries] - Injectable query module for testing.
 */
export async function runSnapshotCommand({
  args,
  options,
  mapData,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? {
    listSnapshots,
    getSnapshotScores,
    getItemTrend,
    getSnapshotComparison,
  };
  const [sub] = args;

  switch (sub) {
    case "list":
      return runList({ supabase, format, q });
    case "show":
      return runShow({ supabase, options, mapData, format, q });
    case "trend":
      return runTrend({ supabase, options, format, q });
    case "compare":
      return runCompare({ supabase, options, mapData, format, q });
    default:
      throw new Error(
        'snapshot: expected "list", "show", "trend", or "compare" subcommand',
      );
  }
}

async function runList({ supabase, format, q }) {
  const snapshots = await q.listSnapshots(supabase);
  if (!snapshots || snapshots.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_SNAPSHOTS },
    };
  }
  return { view: { snapshots }, meta: { format } };
}

async function runShow({ supabase, options, mapData, format, q }) {
  if (!options.snapshot) {
    throw new Error("snapshot show: --snapshot <id> is required");
  }
  const scores = await q.getSnapshotScores(supabase, options.snapshot, {
    managerEmail: options.manager,
  });
  if (!scores || scores.length === 0) {
    const emptyState = options.manager
      ? EMPTY_STATES.MANAGER_NOT_FOUND(options.manager)
      : EMPTY_STATES.NO_SNAPSHOTS;
    return { view: null, meta: { format, emptyState } };
  }
  const warnings = collectDriverWarnings(scores, mapData);
  return {
    view: { snapshotId: options.snapshot, scores },
    meta: { format, warnings },
  };
}

async function runTrend({ supabase, options, format, q }) {
  if (!options.item) {
    throw new Error("snapshot trend: --item <item_id> is required");
  }
  const trend = await q.getItemTrend(supabase, options.item, {
    managerEmail: options.manager,
  });
  if (!trend || trend.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_SNAPSHOTS },
    };
  }
  return { view: { itemId: options.item, trend }, meta: { format } };
}

async function runCompare({ supabase, options, mapData, format, q }) {
  if (!options.snapshot) {
    throw new Error("snapshot compare: --snapshot <id> is required");
  }
  const scores = await q.getSnapshotComparison(supabase, options.snapshot, {
    managerEmail: options.manager,
  });
  if (!scores || scores.length === 0) {
    const emptyState = options.manager
      ? EMPTY_STATES.MANAGER_NOT_FOUND(options.manager)
      : EMPTY_STATES.NO_SNAPSHOTS;
    return { view: null, meta: { format, emptyState } };
  }
  const warnings = collectDriverWarnings(scores, mapData);
  return {
    view: { snapshotId: options.snapshot, scores },
    meta: { format, warnings },
  };
}

/**
 * Cross-reference score item_ids against known drivers.
 * Unknown items produce warnings.
 */
export function collectDriverWarnings(scores, mapData) {
  const driverIds = new Set((mapData.drivers ?? []).map((d) => d.id));
  const warnings = [];
  for (const row of scores) {
    if (row.item_id && !driverIds.has(row.item_id)) {
      warnings.push(
        `Unknown item_id "${row.item_id}" in snapshot scores — no matching driver in drivers.yaml.`,
      );
    }
  }
  // Deduplicate
  return [...new Set(warnings)];
}

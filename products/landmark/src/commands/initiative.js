/**
 * `fit-landmark initiative list|show|impact`
 *
 * Initiative tracking views.
 */

import {
  listInitiatives,
  getInitiative,
} from "@forwardimpact/map/activity/queries/initiatives";
import {
  listSnapshots,
  getSnapshotScores,
} from "@forwardimpact/map/activity/queries/snapshots";

import { EMPTY_STATES } from "../lib/empty-state.js";
import { isRelationNotFoundError } from "../lib/supabase.js";
import { computeInitiativeImpact } from "../lib/initiative-helpers.js";

export const needsSupabase = true;

export async function runInitiativeCommand({
  args,
  options,
  supabase,
  mapData,
  format,
  queries,
}) {
  const q = queries ?? {
    listInitiatives,
    getInitiative,
    listSnapshots,
    getSnapshotScores,
  };
  const [sub] = args;

  switch (sub) {
    case "list":
      return runList({ options, supabase, format, q });
    case "show":
      return runShow({ options, supabase, format, q });
    case "impact":
      return runImpact({ options, supabase, mapData, format, q });
    default:
      throw new Error(
        'initiative: expected "list", "show", or "impact" subcommand',
      );
  }
}

async function runList({ options, supabase, format, q }) {
  let initiatives;
  try {
    initiatives = await q.listInitiatives(supabase, {
      managerEmail: options.manager,
    });
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      return {
        view: null,
        meta: { format, emptyState: EMPTY_STATES.NO_INITIATIVES },
      };
    }
    throw err;
  }

  if (!initiatives || initiatives.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_INITIATIVES },
    };
  }

  return { view: { initiatives }, meta: { format } };
}

async function runShow({ options, supabase, format, q }) {
  if (!options.id) {
    throw new Error("initiative show: --id <id> is required");
  }

  let initiative;
  try {
    initiative = await q.getInitiative(supabase, options.id);
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      return {
        view: null,
        meta: { format, emptyState: EMPTY_STATES.NO_INITIATIVES },
      };
    }
    throw err;
  }

  if (!initiative) {
    return {
      view: null,
      meta: {
        format,
        emptyState: `No initiative found with id ${options.id}.`,
      },
    };
  }

  return { view: { initiative }, meta: { format } };
}

async function runImpact({ options, supabase, mapData, format, q }) {
  let completed;
  try {
    completed = await q.listInitiatives(supabase, {
      managerEmail: options.manager,
      status: "completed",
    });
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      return {
        view: null,
        meta: { format, emptyState: EMPTY_STATES.NO_INITIATIVES },
      };
    }
    throw err;
  }

  if (!completed || completed.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_INITIATIVES },
    };
  }

  const snapshots = await q.listSnapshots(supabase);

  // Build scores lookup
  const scoresBySnapshot = new Map();
  const relevantSnapshotIds = new Set(snapshots.map((s) => s.snapshot_id));

  for (const snapshotId of relevantSnapshotIds) {
    const scores = await q.getSnapshotScores(supabase, snapshotId, {
      managerEmail: options.manager,
    });
    const scoreMap = new Map();
    for (const s of scores) {
      scoreMap.set(s.item_id, s.score);
    }
    scoresBySnapshot.set(snapshotId, scoreMap);
  }

  const impacts = computeInitiativeImpact({
    completed,
    snapshots,
    scoresBySnapshot,
  });

  // Enrich with driver name from mapData
  const driverMap = new Map((mapData.drivers ?? []).map((d) => [d.id, d]));

  const enriched = impacts.map((i) => ({
    ...i,
    driverName: driverMap.get(i.initiative.scorecard_id)?.name ?? null,
  }));

  return {
    view: { impacts: enriched },
    meta: { format },
  };
}

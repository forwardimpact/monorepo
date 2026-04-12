/**
 * `fit-landmark voice --manager <email> | --email <email>`
 *
 * Surface engineer voice from GetDX snapshot comments.
 */

import { getSnapshotComments } from "@forwardimpact/map/activity/queries/comments";
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import {
  listSnapshots,
  getSnapshotScores,
} from "@forwardimpact/map/activity/queries/snapshots";
import { isRelationNotFoundError } from "../lib/supabase.js";
import { EMPTY_STATES } from "../lib/empty-state.js";
import { groupEvidenceBySkill } from "../lib/evidence-helpers.js";

export const needsSupabase = true;

/** Simple theme keywords for crude bucketing. */
const THEME_KEYWORDS = [
  "estimation",
  "incident",
  "planning",
  "handoff",
  "onboarding",
  "deploy",
  "runbook",
  "testing",
  "documentation",
  "tooling",
];

export async function runVoiceCommand({
  options,
  supabase,
  mapData,
  format,
  queries,
}) {
  const q = queries ?? {
    getSnapshotComments,
    getEvidence,
    listSnapshots,
    getSnapshotScores,
  };

  if (options.email) {
    return runEmailVoice({
      email: options.email,
      supabase,
      mapData,
      format,
      q,
    });
  }
  if (options.manager) {
    return runManagerVoice({
      managerEmail: options.manager,
      supabase,
      mapData,
      format,
      q,
    });
  }
  throw new Error("voice: one of --email or --manager is required");
}

async function runEmailVoice({
  email,
  supabase,
  mapData: _mapData,
  format,
  q,
}) {
  let comments;
  try {
    comments = await q.getSnapshotComments(supabase, { email });
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      return {
        view: null,
        meta: { format, emptyState: EMPTY_STATES.NO_COMMENTS },
      };
    }
    throw err;
  }

  if (!comments || comments.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_COMMENTS,
        hint: "No comments in scope — try broadening the --email filter.",
      },
    };
  }

  // Limit to last 4 snapshots
  const snapshotIds = [...new Set(comments.map((c) => c.snapshot_id))];
  const recentSnapshots = snapshotIds.slice(0, 4);
  const recentComments = comments.filter((c) =>
    recentSnapshots.includes(c.snapshot_id),
  );

  // Get evidence context
  const evidenceRows = await q.getEvidence(supabase, { email });
  const evidenceBySkill = groupEvidenceBySkill(evidenceRows);

  const evidenceContext = [];
  for (const [skillId, group] of evidenceBySkill) {
    evidenceContext.push({
      skillId,
      matched: group.matched,
      highestLevel: null, // simplified
    });
  }

  return {
    view: {
      mode: "email",
      email,
      comments: recentComments.map((c) => ({
        snapshotDate: c.getdx_snapshots?.scheduled_for ?? c.snapshot_id,
        text: c.text,
      })),
      evidenceContext,
    },
    meta: { format },
  };
}

async function runManagerVoice({ managerEmail, supabase, mapData, format, q }) {
  let comments;
  try {
    comments = await q.getSnapshotComments(supabase, { managerEmail });
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      return {
        view: null,
        meta: { format, emptyState: EMPTY_STATES.NO_COMMENTS },
      };
    }
    throw err;
  }

  if (!comments || comments.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_COMMENTS,
        hint: "No comments in scope — try broadening the --manager filter.",
      },
    };
  }

  const sortedThemes = bucketCommentsByTheme(comments);
  const healthAlignment = await findHealthAlignment(
    q,
    supabase,
    managerEmail,
    mapData,
  );

  return {
    view: {
      mode: "manager",
      managerEmail,
      totalComments: comments.length,
      themes: sortedThemes,
      healthAlignment,
    },
    meta: { format },
  };
}

/** Bucket comments by theme keywords and return sorted by count. */
function bucketCommentsByTheme(comments) {
  const themes = new Map();
  for (const keyword of THEME_KEYWORDS) {
    themes.set(keyword, { count: 0, snippets: [] });
  }

  for (const c of comments) {
    const lower = (c.text ?? "").toLowerCase();
    for (const keyword of THEME_KEYWORDS) {
      if (lower.includes(keyword)) {
        const theme = themes.get(keyword);
        theme.count++;
        if (theme.snippets.length < 2) {
          theme.snippets.push(c.text);
        }
      }
    }
  }

  return [...themes.entries()]
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([keyword, data]) => ({
      theme: keyword,
      count: data.count,
      snippets: data.snippets,
    }));
}

/** Find health signals that score below 50th percentile. */
async function findHealthAlignment(q, supabase, managerEmail, mapData) {
  try {
    const snapshots = await q.listSnapshots(supabase);
    if (!snapshots || snapshots.length === 0) return [];

    const latestScores = await q.getSnapshotScores(
      supabase,
      snapshots[0].snapshot_id,
      { managerEmail },
    );
    const driverMap = new Map((mapData.drivers ?? []).map((d) => [d.id, d]));
    const alignment = [];
    for (const score of latestScores) {
      const driver = driverMap.get(score.item_id);
      if (driver && score.score != null && score.score < 50) {
        alignment.push({
          driverId: driver.id,
          driverName: driver.name,
          percentile: score.score,
        });
      }
    }
    return alignment;
  } catch {
    return [];
  }
}

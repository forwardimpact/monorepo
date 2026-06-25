/**
 * `fit-landmark health [--manager <email>]`
 *
 * Health view joining snapshot scores, contributing-skill evidence, and
 * Summit growth recommendations.
 */

import {
  getOrganization,
  getTeam,
} from "@forwardimpact/map/activity/queries/org";
import {
  listSnapshots,
  getSnapshotScores,
} from "@forwardimpact/map/activity/queries/snapshots";
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import { getSnapshotComments } from "@forwardimpact/map/activity/queries/comments";
import { EMPTY_STATES } from "../lib/empty-state.js";
import { isRelationNotFoundError } from "../lib/supabase.js";
import {
  groupEvidenceBySkill,
  filterEvidenceByTeam,
} from "../lib/evidence-helpers.js";
import { computeGrowth } from "../lib/summit.js";

export const needsSupabase = true;

/** Build a health view joining snapshot scores, contributing-skill evidence, comments, and Summit growth recommendations. */
export async function runHealthCommand({
  options,
  mapData,
  supabase,
  format,
  queries,
  summitFn,
}) {
  const q = queries ?? {
    getOrganization,
    getTeam,
    listSnapshots,
    getSnapshotScores,
    getEvidence,
    getSnapshotComments,
  };
  const growth = summitFn ?? computeGrowth;

  const meta = { format, warnings: [] };

  // 1. Get the team or org
  const teamResult = await resolveTeam(q, supabase, options, meta);
  if (!teamResult) return { view: null, meta };
  const { team, teamLabel } = teamResult;

  // 2. Get latest snapshot
  const latestSnapshot = await resolveLatestSnapshot(q, supabase, meta);
  if (!latestSnapshot) return { view: null, meta };

  // 3. Get scores
  const scores = await q.getSnapshotScores(
    supabase,
    latestSnapshot.snapshot_id,
    { managerEmail: options.manager },
  );

  // Snapshot comments are fetched once for the whole resolved set; each team's
  // driver section filters them by its own contributing-skill keywords.
  const allComments = await fetchComments(
    q,
    supabase,
    latestSnapshot,
    options,
    meta,
  );

  const ctx = { mapData, q, supabase, options, growth, meta };

  // 4. When the resolved members span two or more GetDX teams (a director-tier
  // rollup), emit one symmetric per-team section instead of a single collapsed
  // driver table. Each section is built from that team's own members and score
  // subset, so it equals the output of the existing per-team-manager filter.
  const teamIds = [
    ...new Set(team.map((p) => p.getdx_team_id).filter(Boolean)),
  ];

  if (teamIds.length >= 2) {
    const teamRollup = [];
    for (const teamId of teamIds) {
      const teamMembers = team.filter((p) => p.getdx_team_id === teamId);
      const teamScores = scores.filter((s) => s.getdx_team_id === teamId);
      const section = await buildTeamSection(
        ctx,
        teamMembers,
        teamScores,
        allComments,
      );
      teamRollup.push({
        teamId,
        teamName: teamScores[0]?.team_name ?? teamId,
        ...section,
      });
    }
    meta.warnings = [...new Set(meta.warnings)];
    return {
      view: {
        teamLabel,
        snapshotId: latestSnapshot.snapshot_id,
        snapshotDate: latestSnapshot.scheduled_for,
        scope: { teamCount: teamIds.length, tierLabel: teamLabel },
        teamRollup,
      },
      meta,
    };
  }

  // Single-team (or org-wide) path — unchanged shape.
  const section = await buildTeamSection(ctx, team, scores, allComments);
  meta.warnings = [...new Set(meta.warnings)];

  return {
    view: {
      teamLabel,
      snapshotId: latestSnapshot.snapshot_id,
      snapshotDate: latestSnapshot.scheduled_for,
      drivers: section.drivers,
      driverJoin: section.driverJoin,
      summitAvailable: section.summitAvailable,
    },
    meta,
  };
}

/**
 * Build the driver rows, driver-join state, and Summit availability for one
 * scope (a single team's members and score subset). Shared by the single-team
 * path and each per-team rollup section so they produce identical row shapes.
 *
 * @param {{mapData: object, q: object, supabase: object, options: object,
 *   growth: Function, meta: object}} ctx
 * @param {Array<object>} members - Resolved people for this scope
 * @param {Array<object>} scores - Score rows for this scope
 * @param {Array<object>} allComments - Snapshot comments for the whole set
 * @returns {Promise<{drivers: Array<object>, driverJoin: object,
 *   summitAvailable: boolean}>}
 */
async function buildTeamSection(ctx, members, scores, allComments) {
  const { mapData, q, supabase, options, growth, meta } = ctx;
  const teamEmails = new Set(members.map((p) => p.email));

  const { drivers, collectedEvidence } = await buildDriverRows(
    scores,
    mapData,
    q,
    supabase,
    options,
    teamEmails,
    meta,
  );

  attachComments(drivers, allComments);

  const driverJoin = computeDriverJoin(mapData, scores, drivers);

  const growthResult = await computeGrowthRecommendations(
    growth,
    members,
    mapData,
    collectedEvidence,
    drivers,
    meta,
  );

  return { drivers, driverJoin, summitAvailable: growthResult.available };
}

/**
 * Classify the snapshot-to-drivers.yaml join into one of three observable
 * states so the formatter can distinguish "no drivers configured" from
 * "configured but disjoint from snapshot ids" from "matched".
 */
function computeDriverJoin(mapData, scores, drivers) {
  const yamlIds = (mapData.drivers ?? []).length;
  const scoreIds = new Set(scores.map((s) => s.item_id)).size;
  const matched = drivers.length;
  let state = null;
  if (yamlIds === 0) state = "NO_DRIVERS";
  else if (scoreIds > 0 && matched === 0) state = "NO_MATCH";
  else if (matched > 0) state = "MATCHED";
  return { state, yamlIds, scoreIds, matched };
}

/** Resolve team members (by manager or full org). Returns null on empty state. */
async function resolveTeam(q, supabase, options, meta) {
  if (options.manager) {
    const team = await q.getTeam(supabase, options.manager);
    if (!team || team.length === 0) {
      meta.emptyState = EMPTY_STATES.MANAGER_NOT_FOUND(options.manager);
      return null;
    }
    return { team, teamLabel: `${options.manager} team` };
  }
  const team = await q.getOrganization(supabase);
  if (!team || team.length === 0) {
    meta.emptyState = EMPTY_STATES.NO_ORGANIZATION;
    return null;
  }
  return { team, teamLabel: "Organization" };
}

/** Fetch the latest snapshot. Returns null on empty state. */
async function resolveLatestSnapshot(q, supabase, meta) {
  const snapshots = await q.listSnapshots(supabase);
  if (!snapshots || snapshots.length === 0) {
    meta.emptyState = EMPTY_STATES.NO_SNAPSHOTS;
    return null;
  }
  return snapshots[0];
}

/** Join score rows to driver definitions and gather per-skill evidence. */
async function buildDriverRows(
  scores,
  mapData,
  q,
  supabase,
  options,
  teamEmails,
  meta,
) {
  const driverMap = new Map((mapData.drivers ?? []).map((d) => [d.id, d]));
  const drivers = [];
  const collectedEvidence = new Map();

  for (const scoreRow of scores) {
    const driver = driverMap.get(scoreRow.item_id);
    if (!driver) {
      meta.warnings.push(
        `Unknown item_id "${scoreRow.item_id}" in snapshot scores — no matching driver in drivers.yaml.`,
      );
      continue;
    }

    const skillEvidence = await gatherSkillEvidence(
      driver.contributingSkills ?? [],
      q,
      supabase,
      options,
      teamEmails,
      collectedEvidence,
    );

    drivers.push({
      id: driver.id,
      name: driver.name,
      score: scoreRow.score,
      vs_prev: scoreRow.vs_prev,
      vs_org: scoreRow.vs_org,
      vs_50th: scoreRow.vs_50th,
      vs_75th: scoreRow.vs_75th,
      vs_90th: scoreRow.vs_90th,
      contributingSkills: skillEvidence,
      comments: [],
      recommendations: [],
    });
  }

  return { drivers, collectedEvidence };
}

/** Collect evidence counts for a list of contributing skill ids. Caches raw rows in collectedEvidence. */
async function gatherSkillEvidence(
  skillIds,
  q,
  supabase,
  options,
  teamEmails,
  collectedEvidence,
) {
  const skillEvidence = [];
  for (const skillId of skillIds) {
    if (!collectedEvidence.has(skillId)) {
      const allEvidence = await q.getEvidence(supabase, { skillId });
      const teamEvidence = options.manager
        ? filterEvidenceByTeam(allEvidence, teamEmails)
        : allEvidence;
      collectedEvidence.set(skillId, teamEvidence);
    }
    const teamEvidence = collectedEvidence.get(skillId);
    const grouped = groupEvidenceBySkill(teamEvidence);
    const count = grouped.get(skillId)?.matched ?? 0;
    skillEvidence.push({ skillId, count });
  }
  return skillEvidence;
}

/** Fetch snapshot comments, returning [] on error or absence. */
async function fetchComments(q, supabase, latestSnapshot, options, meta) {
  if (!q.getSnapshotComments) return [];
  try {
    return await q.getSnapshotComments(supabase, {
      snapshotId: latestSnapshot.snapshot_id,
      managerEmail: options.manager,
    });
  } catch (err) {
    if (isRelationNotFoundError(err)) {
      meta.warnings.push("Snapshot comments unavailable — table not present.");
      return [];
    }
    throw err;
  }
}

/** Attach comments to drivers by keyword match on contributing skill names. */
function attachComments(drivers, allComments) {
  if (allComments.length === 0) return;
  for (const d of drivers) {
    const skillKeywords = (d.contributingSkills ?? []).map((s) =>
      s.skillId.replace(/[-_]/g, " ").toLowerCase(),
    );
    d.comments = allComments
      .filter((c) => {
        const lower = (c.text ?? "").toLowerCase();
        return skillKeywords.some((kw) => lower.includes(kw));
      })
      .slice(0, 3);
  }
}

/** Compute Summit growth recommendations and attach to drivers. */
async function computeGrowthRecommendations(
  growth,
  team,
  mapData,
  collectedEvidence,
  drivers,
  meta,
) {
  const summitTeam = team.map((p) => ({
    email: p.email,
    name: p.name,
    job: { discipline: p.discipline, level: p.level, track: p.track },
  }));

  const summitEvidence = buildSummitEvidence(collectedEvidence);

  const driverScores = new Map();
  for (const d of drivers) {
    driverScores.set(d.id, { percentile: d.score });
  }

  const growthResult = await growth({
    team: summitTeam,
    mapData,
    evidence: summitEvidence,
    driverScores,
  });

  if (growthResult.warnings.length > 0) {
    meta.warnings.push(...growthResult.warnings);
  }

  if (growthResult.available && growthResult.recommendations.length > 0) {
    for (const rec of growthResult.recommendations) {
      for (const d of drivers) {
        const contributes = d.contributingSkills.some(
          (s) => s.skillId === rec.skill,
        );
        if (contributes) {
          d.recommendations.push(rec);
        }
      }
    }
  }

  return growthResult;
}

/** Build the evidence map Summit expects from already-collected per-skill evidence. */
function buildSummitEvidence(collectedEvidence) {
  const summitEvidence = new Map();
  for (const [skillId, rows] of collectedEvidence) {
    const grouped = groupEvidenceBySkill(rows);
    const group = grouped.get(skillId);
    if (!group) continue;
    const practitioners = new Set(
      group.rows
        .filter((r) => r.matched)
        .map((r) => r.github_artifacts?.email)
        .filter(Boolean),
    );
    summitEvidence.set(skillId, { practitioners, count: group.matched });
  }
  return summitEvidence;
}

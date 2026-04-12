/**
 * `fit-landmark practiced --manager <email>`
 *
 * Show evidenced depth alongside derived depth for a manager's team.
 */

import { getTeam } from "@forwardimpact/map/activity/queries/org";
import { getPracticePatterns } from "@forwardimpact/map/activity/queries/evidence";
import { deriveSkillMatrix } from "@forwardimpact/libskill";
import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";

import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

export async function runPracticedCommand({
  options,
  mapData,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getTeam, getPracticePatterns };

  if (!options.manager) {
    throw new Error("practiced: --manager <email> is required");
  }

  const team = await q.getTeam(supabase, options.manager);
  if (!team || team.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.MANAGER_NOT_FOUND(options.manager),
      },
    };
  }

  // Derive expected skills per team member, aggregate highest per skill
  const derivedDepths = aggregateDerivedDepths(team, mapData);

  // Fetch practice patterns
  const patterns = await q.getPracticePatterns(supabase, {
    managerEmail: options.manager,
  });

  const evidencedDepths = buildEvidencedDepths(patterns);

  // Build the comparison view
  const skills = buildSkillComparison(derivedDepths, evidencedDepths, mapData);

  const hasEvidence = patterns.length > 0;

  return {
    view: {
      managerEmail: options.manager,
      teamSize: team.length,
      skills,
    },
    meta: {
      format,
      emptyState: hasEvidence ? undefined : EMPTY_STATES.NO_EVIDENCE,
    },
  };
}

/** Aggregate highest derived depth per skill across all team members. */
function aggregateDerivedDepths(team, mapData) {
  const derivedDepths = new Map();
  for (const member of team) {
    const discipline = (mapData.disciplines ?? []).find(
      (d) => d.id === member.discipline,
    );
    const level = (mapData.levels ?? []).find((l) => l.id === member.level);
    const track = member.track
      ? (mapData.tracks ?? []).find((t) => t.id === member.track)
      : null;

    if (!discipline || !level) continue;

    const matrix = deriveSkillMatrix({
      discipline,
      level,
      track,
      skills: mapData.skills,
    });

    for (const entry of matrix) {
      const currentIdx = derivedDepths.get(entry.skillId) ?? -1;
      const entryIdx = SKILL_PROFICIENCY_ORDER.indexOf(entry.proficiency);
      if (entryIdx > currentIdx) {
        derivedDepths.set(entry.skillId, entryIdx);
      }
    }
  }
  return derivedDepths;
}

/** Extract evidenced skill depths from practice patterns. */
function buildEvidencedDepths(patterns) {
  const evidencedDepths = new Map();
  for (const p of patterns) {
    if (p.matched > 0) {
      evidencedDepths.set(p.skill_id, p.matched);
    }
  }
  return evidencedDepths;
}

/** Build sorted skill comparison rows from derived and evidenced depths. */
function buildSkillComparison(derivedDepths, evidencedDepths, mapData) {
  const allSkillIds = new Set([
    ...derivedDepths.keys(),
    ...evidencedDepths.keys(),
  ]);

  const skills = [];
  for (const skillId of allSkillIds) {
    const derivedIdx = derivedDepths.get(skillId) ?? -1;
    const derivedDepth =
      derivedIdx >= 0 ? SKILL_PROFICIENCY_ORDER[derivedIdx] : null;
    const evidencedCount = evidencedDepths.get(skillId) ?? 0;
    const skillObj = (mapData.skills ?? []).find((s) => s.id === skillId);

    const flag = deriveFlag(derivedDepth, evidencedCount);

    skills.push({
      skillId,
      skillName: skillObj?.name ?? skillId,
      derivedDepth,
      evidencedCount,
      flag,
    });
  }

  skills.sort((a, b) => a.skillId.localeCompare(b.skillId));
  return skills;
}

/** Determine the flag for a skill based on derived vs evidenced status. */
function deriveFlag(derivedDepth, evidencedCount) {
  if (derivedDepth && evidencedCount === 0) return "on paper only";
  if (!derivedDepth && evidencedCount > 0) return "evidenced beyond role";
  return null;
}

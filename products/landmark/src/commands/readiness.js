/**
 * `fit-landmark readiness --email <email> [--target <level>]`
 *
 * Show marker checklist for a target level.
 */

import { getPerson } from "@forwardimpact/map/activity/queries/org";
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import { deriveSkillMatrix, getNextLevel } from "@forwardimpact/libskill";

import { EMPTY_STATES } from "../lib/empty-state.js";
import { buildMarkerChecklist } from "../lib/evidence-helpers.js";

export const needsSupabase = true;

export async function runReadinessCommand({
  options,
  mapData,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getPerson, getEvidence };

  if (!options.email) {
    throw new Error("readiness: --email <email> is required");
  }

  const person = await q.getPerson(supabase, options.email);
  if (!person) {
    return emptyResult(format, EMPTY_STATES.PERSON_NOT_FOUND(options.email));
  }

  const resolved = resolveTargetLevel(person, options, mapData);
  if (resolved.error) return emptyResult(format, resolved.error);

  const { currentLevel, targetLevel, discipline, track } = resolved;

  const matrix = deriveSkillMatrix({
    discipline,
    level: targetLevel,
    track,
    skills: mapData.skills,
  });

  const { checklist, skippedSkills } = partitionMatrix(matrix, mapData);

  if (checklist.length === 0) {
    return emptyResult(format, EMPTY_STATES.NO_MARKERS_AT_TARGET);
  }

  const evidenceRows = await q.getEvidence(supabase, { email: options.email });
  const matchedEvidence = (evidenceRows ?? []).filter((e) => e.matched);

  const items = buildChecklistItems(checklist, matchedEvidence);
  const summary = summarizeChecklist(items);

  return {
    view: {
      email: options.email,
      currentLevel: currentLevel.id,
      targetLevel: targetLevel.id,
      checklist: items,
      skippedSkills,
      summary,
    },
    meta: { format },
  };
}

function emptyResult(format, emptyState) {
  return { view: null, meta: { format, emptyState } };
}

/** Resolve current level, target level, discipline, and track from the person and options. */
function resolveTargetLevel(person, options, mapData) {
  const currentLevel = (mapData.levels ?? []).find(
    (l) => l.id === person.level,
  );
  if (!currentLevel) {
    return { error: `Unknown level "${person.level}" for ${options.email}.` };
  }

  let targetLevel;
  if (options.target) {
    targetLevel = (mapData.levels ?? []).find((l) => l.id === options.target);
    if (!targetLevel) {
      return { error: `Unknown target level "${options.target}".` };
    }
  } else {
    targetLevel = getNextLevel({ level: currentLevel, levels: mapData.levels });
    if (!targetLevel) {
      return { error: EMPTY_STATES.NO_HIGHER_LEVEL(currentLevel.id) };
    }
  }

  const discipline = (mapData.disciplines ?? []).find(
    (d) => d.id === person.discipline,
  );
  if (!discipline) {
    return {
      error: `Unknown discipline "${person.discipline}" for ${options.email}.`,
    };
  }

  const track = person.track
    ? (mapData.tracks ?? []).find((t) => t.id === person.track)
    : null;

  return { currentLevel, targetLevel, discipline, track };
}

/** Check if a marker entry has any content. */
function hasMarkers(markers) {
  if (!markers) return false;
  const hasHuman = markers.human && markers.human.length > 0;
  const hasAgent = markers.agent && markers.agent.length > 0;
  return hasHuman || hasAgent;
}

/** Partition matrix entries into those with markers and those without. */
function partitionMatrix(matrix, mapData) {
  const checklist = [];
  const skippedSkills = [];

  for (const entry of matrix) {
    const skill = (mapData.skills ?? []).find((s) => s.id === entry.skillId);
    if (!skill) continue;

    const markers = skill.markers?.[entry.proficiency];
    if (!hasMarkers(markers)) {
      skippedSkills.push({
        skillId: entry.skillId,
        reason: `no markers at ${entry.proficiency}`,
      });
      continue;
    }

    checklist.push({
      skillId: entry.skillId,
      skillName: entry.skillName,
      proficiency: entry.proficiency,
      markers,
    });
  }

  return { checklist, skippedSkills };
}

/** Build checklist items from checklist entries and matched evidence. */
function buildChecklistItems(checklist, matchedEvidence) {
  return checklist.map((entry) => {
    const skillEvidence = matchedEvidence.filter(
      (e) => e.skill_id === entry.skillId,
    );
    return {
      skillId: entry.skillId,
      skillName: entry.skillName,
      proficiency: entry.proficiency,
      items: buildMarkerChecklist(entry.markers, skillEvidence),
    };
  });
}

/** Summarize the checklist into evidenced/total/missing. */
function summarizeChecklist(items) {
  const total = items.reduce((sum, s) => sum + s.items.length, 0);
  const evidenced = items.reduce(
    (sum, s) => sum + s.items.filter((i) => i.evidenced).length,
    0,
  );
  const missing = items.flatMap((s) =>
    s.items.filter((i) => !i.evidenced).map((i) => i.marker),
  );
  return { evidenced, total, missing };
}

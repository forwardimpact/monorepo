/**
 * `fit-landmark marker <skill> [--level <level>]` — marker reference view.
 *
 * Displays marker definitions from Map's capability YAML files.
 * Does not require Supabase.
 */

import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = false;

/**
 * @param {object} params
 * @param {string[]} params.args
 * @param {object} params.options
 * @param {object} params.mapData
 * @param {string} params.format
 */
export async function runMarkerCommand({ args, options, mapData, format }) {
  const [skillId] = args;
  if (!skillId) {
    throw new Error("marker: skill id is required");
  }

  const skill = findSkill(mapData, skillId);
  if (!skill) {
    return {
      view: null,
      meta: { format, emptyState: `Skill not found: ${skillId}` },
    };
  }

  const markers = skill.markers ?? null;
  if (!markers || Object.keys(markers).length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_MARKERS_FOR_SKILL(skillId),
      },
    };
  }

  const levelFilter = options.level ?? null;
  let filtered;
  if (levelFilter) {
    const levelMarkers = markers[levelFilter];
    if (!levelMarkers) {
      return {
        view: null,
        meta: {
          format,
          emptyState: EMPTY_STATES.NO_MARKERS_FOR_SKILL(
            `${skillId} at level ${levelFilter}`,
          ),
        },
      };
    }
    filtered = { [levelFilter]: levelMarkers };
  } else {
    filtered = markers;
  }

  return {
    view: { skill: skill.id, name: skill.name, markers: filtered },
    meta: { format },
  };
}

/**
 * Find a skill by id across all capabilities in mapData.
 */
function findSkill(mapData, skillId) {
  const skills = mapData.skills ?? [];
  return skills.find((s) => s.id === skillId) ?? null;
}

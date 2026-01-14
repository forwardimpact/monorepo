/**
 * Track presentation helpers
 *
 * Shared utilities for formatting track data across DOM and markdown outputs.
 */

import { isCapability, getSkillsByCapability } from "../../model/modifiers.js";
import { truncate } from "../shared.js";

/**
 * Sort tracks by type: professional tracks first, then management tracks.
 * Within each type, preserves original order.
 * @param {Array} tracks - Raw track entities
 * @returns {Array} Sorted tracks array
 */
export function sortTracksByType(tracks) {
  return [...tracks].sort((a, b) => {
    const aFlags = getTrackTypeFlags(a);
    const bFlags = getTrackTypeFlags(b);

    // Professional tracks come first
    if (aFlags.isProfessional && !bFlags.isProfessional) return -1;
    if (!aFlags.isProfessional && bFlags.isProfessional) return 1;

    // Preserve original order within same type
    return 0;
  });
}

/**
 * Determine track type flags from track data.
 *
 * Logic: Only one flag needs to be explicitly set to true; the other defaults to false.
 * - If isManagement: true → management track (isProfessional = false)
 * - If isProfessional: true (or neither set) → professional track (isManagement = false)
 *
 * @param {Object} track
 * @param {boolean} [track.isProfessional] - Whether this is a professional/IC track
 * @param {boolean} [track.isManagement] - Whether this is a management track
 * @returns {{isProfessional: boolean, isManagement: boolean}}
 */
export function getTrackTypeFlags(track) {
  // Management takes precedence if explicitly set to true
  const isManagement = track.isManagement === true;
  // Professional is true if management is not true (default behavior)
  const isProfessional = !isManagement && track.isProfessional !== false;
  return { isProfessional, isManagement };
}

/**
 * @typedef {Object} TrackListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} truncatedDescription
 * @property {boolean} isProfessional
 * @property {boolean} isManagement
 */

/**
 * Transform tracks for list view
 * @param {Array} tracks - Raw track entities
 * @param {number} [descriptionLimit=120] - Maximum description length
 * @returns {{ items: TrackListItem[] }}
 */
export function prepareTracksList(tracks, descriptionLimit = 120) {
  const sortedTracks = sortTracksByType(tracks);
  const items = sortedTracks.map((track) => {
    const { isProfessional, isManagement } = getTrackTypeFlags(track);
    return {
      id: track.id,
      name: track.name,
      description: track.description,
      truncatedDescription: truncate(track.description, descriptionLimit),
      isProfessional,
      isManagement,
    };
  });

  return { items };
}

/**
 * @typedef {Object} SkillModifierRow
 * @property {string} id
 * @property {string} name
 * @property {number} modifier
 * @property {boolean} isCapability
 * @property {Array<{id: string, name: string}>} [skills]
 */

/**
 * @typedef {Object} BehaviourModifierRow
 * @property {string} id
 * @property {string} name
 * @property {number} modifier
 */

/**
 * @typedef {Object} TrackDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {boolean} isProfessional
 * @property {boolean} isManagement
 * @property {SkillModifierRow[]} skillModifiers
 * @property {BehaviourModifierRow[]} behaviourModifiers
 * @property {Array<{id: string, name: string}>} validDisciplines
 */

/**
 * Transform track for detail view
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines
 * @returns {TrackDetailView|null}
 */
export function prepareTrackDetail(track, { skills, behaviours, disciplines }) {
  if (!track) return null;

  const { isProfessional, isManagement } = getTrackTypeFlags(track);

  // Build skill modifiers
  const skillModifiers = track.skillModifiers
    ? Object.entries(track.skillModifiers).map(([key, modifier]) => {
        if (isCapability(key)) {
          const capabilitySkills = getSkillsByCapability(skills, key);
          return {
            id: key,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            modifier,
            isCapability: true,
            skills: capabilitySkills.map((s) => ({ id: s.id, name: s.name })),
          };
        } else {
          const skill = skills.find((s) => s.id === key);
          return {
            id: key,
            name: skill?.name || key,
            modifier,
            isCapability: false,
          };
        }
      })
    : [];

  // Build behaviour modifiers
  const behaviourModifiers = track.behaviourModifiers
    ? Object.entries(track.behaviourModifiers).map(
        ([behaviourId, modifier]) => {
          const behaviour = behaviours.find((b) => b.id === behaviourId);
          return {
            id: behaviourId,
            name: behaviour?.name || behaviourId,
            modifier,
          };
        },
      )
    : [];

  // Get valid disciplines
  const validDisciplines = track.validDisciplines
    ? track.validDisciplines
        .map((id) => disciplines.find((d) => d.id === id))
        .filter(Boolean)
        .map((d) => ({ id: d.id, name: d.specialization || d.name }))
    : [];

  return {
    id: track.id,
    name: track.name,
    description: track.description,
    isProfessional,
    isManagement,
    skillModifiers,
    behaviourModifiers,
    validDisciplines,
  };
}

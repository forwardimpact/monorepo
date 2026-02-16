/**
 * Track presentation helpers
 *
 * Shared utilities for formatting track data across DOM and markdown outputs.
 */

import {
  isCapability,
  getSkillsByCapability,
} from "@forwardimpact/libpathway/modifiers";
import { truncate } from "../shared.js";

/**
 * Sort tracks alphabetically by name.
 * @param {Array} tracks - Raw track entities
 * @returns {Array} Sorted tracks array
 */
export function sortTracksByName(tracks) {
  return [...tracks].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @typedef {Object} TrackListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} truncatedDescription
 */

/**
 * Transform tracks for list view
 * @param {Array} tracks - Raw track entities
 * @param {number} [descriptionLimit=120] - Maximum description length
 * @returns {{ items: TrackListItem[] }}
 */
export function prepareTracksList(tracks, descriptionLimit = 120) {
  const sortedTracks = sortTracksByName(tracks);
  const items = sortedTracks.map((track) => {
    return {
      id: track.id,
      name: track.name,
      description: track.description,
      truncatedDescription: truncate(track.description, descriptionLimit),
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
 * @property {SkillModifierRow[]} skillModifiers
 * @property {BehaviourModifierRow[]} behaviourModifiers
 */

/**
 * Transform track for detail view
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines (unused but kept for API compatibility)
 * @returns {TrackDetailView|null}
 */
export function prepareTrackDetail(track, { skills, behaviours }) {
  if (!track) return null;

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

  return {
    id: track.id,
    name: track.name,
    description: track.description,
    skillModifiers,
    behaviourModifiers,
  };
}

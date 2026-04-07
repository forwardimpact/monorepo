/**
 * View builder for track entities.
 */

import { trackIri, skillIri } from "../iri.js";

/**
 * @param {object} track - Raw track entity
 * @returns {object}
 */
export function buildTrackView(track) {
  const skillModifiers = Object.entries(track.skillModifiers || {}).map(
    ([id, modifier]) => ({ skillIri: skillIri(id), id, modifier }),
  );

  return {
    iri: trackIri(track.id),
    id: track.id,
    name: track.name,
    description: track.description || "",
    skillModifiers,
  };
}

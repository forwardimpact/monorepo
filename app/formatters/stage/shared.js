/**
 * Stage presentation helpers
 *
 * Shared utilities for formatting stage data across DOM and CLI outputs.
 */

import { truncate } from "../shared.js";

/**
 * @typedef {Object} StageListItem
 * @property {string} id
 * @property {string} name
 * @property {string} emojiIcon
 * @property {string} description
 * @property {string} truncatedDescription
 * @property {Array<{target: string, label: string}>} handoffs
 */

/**
 * Transform stages for list view
 * @param {Array} stages - Raw stage entities
 * @param {number} [descriptionLimit=150] - Maximum description length
 * @returns {{ items: StageListItem[] }}
 */
export function prepareStagesList(stages, descriptionLimit = 150) {
  const items = stages.map((stage) => {
    return {
      id: stage.id,
      name: stage.name,
      emojiIcon: stage.emojiIcon,
      description: stage.description,
      truncatedDescription: truncate(stage.description, descriptionLimit),
      handoffs: (stage.handoffs || []).map((h) => ({
        target: h.targetStage,
        label: h.label,
      })),
    };
  });

  return { items };
}

/**
 * @typedef {Object} StageDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string[]} constraints
 * @property {string[]} entryCriteria
 * @property {string[]} exitCriteria
 * @property {Array<{target: string, label: string, prompt: string}>} handoffs
 */

/**
 * Transform stage for detail view
 * @param {Object} stage - Raw stage entity
 * @returns {StageDetailView}
 */
export function prepareStageDetail(stage) {
  return {
    id: stage.id,
    name: stage.name,
    description: stage.description,
    constraints: stage.constraints || [],
    entryCriteria: stage.entryCriteria || [],
    exitCriteria: stage.exitCriteria || [],
    handoffs: (stage.handoffs || []).map((h) => ({
      target: h.targetStage,
      label: h.label,
      prompt: h.prompt,
    })),
  };
}

/**
 * Get the stage emoji from loaded stages data
 * @param {Object[]} stages - Loaded stages array
 * @param {string} stageId - Stage identifier
 * @returns {string}
 */
export function getStageEmoji(stages, stageId) {
  const stage = stages.find((s) => s.id === stageId);
  return stage?.emojiIcon;
}

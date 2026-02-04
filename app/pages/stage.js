/**
 * Stages pages
 */

import { render, div, h1, h2, p, span, a, section } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareStagesList, stageToDOM } from "../formatters/stage/index.js";
import { getConceptEmoji } from "../model/levels.js";

/**
 * Map stage to card configuration
 * @param {Object} stage - Prepared stage item (includes emojiIcon)
 * @returns {Object} Card configuration
 */
function stageToCardConfig(stage) {
  return {
    title: `${stage.emojiIcon} ${stage.name}`,
    description: stage.truncatedDescription,
    href: `/stage/${stage.id}`,
  };
}

/**
 * Create lifecycle flow visualization
 * @param {Array} stages - Array of stage items (each includes emojiIcon)
 * @returns {HTMLElement}
 */
function createLifecycleFlow(stages) {
  const flowItems = stages.map((stage, index) => {
    const isLast = index === stages.length - 1;

    return div(
      { className: "lifecycle-flow-item" },
      a(
        { href: `#/stage/${stage.id}`, className: "lifecycle-stage" },
        span({ className: "lifecycle-emoji" }, stage.emojiIcon),
        span({ className: "lifecycle-name" }, stage.name),
      ),
      !isLast ? span({ className: "lifecycle-arrow" }, "→") : null,
    );
  });

  return div({ className: "lifecycle-flow" }, ...flowItems);
}

/**
 * Render stages list page
 */
export function renderStagesList() {
  const { data } = getState();
  const { framework } = data;
  const stages = data.stages || [];
  const stageEmoji = getConceptEmoji(framework, "stage");

  // Transform data for list view
  const { items } = prepareStagesList(stages);

  const page = div(
    { className: "stages-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${stageEmoji} ${framework.entityDefinitions.stage.title}`,
      ),
      p(
        { className: "page-description" },
        framework.entityDefinitions.stage.description.trim().split("\n")[0],
      ),
    ),

    // Lifecycle flow visualization
    items.length > 0
      ? section(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Lifecycle Flow"),
          createLifecycleFlow(items),
        )
      : null,

    // Stages list
    createCardList(items, stageToCardConfig, "No stages found."),
  );

  render(page);
}

/**
 * Render stage detail page
 * @param {Object} params - Route params
 */
export function renderStageDetail(params) {
  const { data } = getState();
  const stages = data.stages || [];
  const stage = stages.find((s) => s.id === params.id);

  if (!stage) {
    renderNotFound({
      entityType: "Stage",
      entityId: params.id,
      backPath: "/stage",
      backText: "← Back to Stages",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(stageToDOM(stage, { stages }));
}

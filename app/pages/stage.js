/**
 * Stages pages
 */

import { render, div, h1, h2, p, span, a, section } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { createDetailHeader } from "../components/detail.js";
import { renderNotFound } from "../components/error-page.js";
import {
  prepareStagesList,
  prepareStageDetail,
  getStageEmoji,
} from "../formatters/stage/index.js";
import { createBadge } from "../components/card.js";

/**
 * Map stage to card configuration
 * @param {Object} stage - Prepared stage item (includes emoji)
 * @returns {Object} Card configuration
 */
function stageToCardConfig(stage) {
  return {
    title: `${stage.emoji || "🔄"} ${stage.name}`,
    description: stage.truncatedDescription,
    href: `/stage/${stage.id}`,
    meta: [createBadge(`${stage.tools.length} tools`, "default")],
  };
}

/**
 * Create lifecycle flow visualization
 * @param {Array} stages - Array of stage items (each includes emoji)
 * @returns {HTMLElement}
 */
function createLifecycleFlow(stages) {
  const flowItems = stages.map((stage, index) => {
    const emoji = stage.emoji || "🔄";
    const isLast = index === stages.length - 1;

    return div(
      { className: "lifecycle-flow-item" },
      a(
        { href: `#/stage/${stage.id}`, className: "lifecycle-stage" },
        span({ className: "lifecycle-emoji" }, emoji),
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
  const stages = data.stages || [];

  // Transform data for list view
  const { items } = prepareStagesList(stages);

  const page = div(
    { className: "stages-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, "🔄 Stages"),
      p(
        { className: "page-description" },
        "The engineering lifecycle stages. Each stage has specific tools, " +
          "constraints, and handoffs to guide work from planning through review.",
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

  // Transform data for detail view
  const view = prepareStageDetail(stage);
  const emoji = getStageEmoji(stages, stage.id);

  const page = div(
    { className: "stage-detail" },
    createDetailHeader({
      title: `${emoji} ${view.name}`,
      description: view.description,
      backLink: "/stage",
      backText: "← Back to Stages",
    }),

    // Tools section
    view.tools.length > 0
      ? section(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Available Tools"),
          div(
            { className: "tool-badges" },
            ...view.tools.map((tool) =>
              span(
                { className: "badge badge-tool", title: tool.label },
                `${tool.icon} ${tool.label}`,
              ),
            ),
          ),
        )
      : null,

    // Entry/Exit Criteria
    view.entryCriteria.length > 0 || view.exitCriteria.length > 0
      ? section(
          { className: "section section-detail" },
          div(
            { className: "content-columns" },
            // Entry criteria column
            view.entryCriteria.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Entry Criteria"),
                  div(
                    { className: "criteria-list" },
                    ...view.entryCriteria.map((item) =>
                      div({ className: "criteria-item" }, `✓ ${item}`),
                    ),
                  ),
                )
              : null,
            // Exit criteria column
            view.exitCriteria.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Exit Criteria"),
                  div(
                    { className: "criteria-list" },
                    ...view.exitCriteria.map((item) =>
                      div({ className: "criteria-item" }, `✓ ${item}`),
                    ),
                  ),
                )
              : null,
          ),
        )
      : null,

    // Constraints
    view.constraints.length > 0
      ? section(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Constraints"),
          div(
            { className: "constraint-list" },
            ...view.constraints.map((item) =>
              div({ className: "constraint-item" }, `⚠️ ${item}`),
            ),
          ),
        )
      : null,

    // Handoffs
    view.handoffs.length > 0
      ? section(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Handoffs"),
          div(
            { className: "handoff-list" },
            ...view.handoffs.map((handoff) => {
              const targetStage = stages.find((s) => s.id === handoff.target);
              const targetEmoji = getStageEmoji(stages, handoff.target);
              return div(
                { className: "card handoff-card" },
                div(
                  { className: "handoff-header" },
                  targetStage
                    ? a(
                        {
                          href: `#/stage/${handoff.target}`,
                          className: "handoff-link",
                        },
                        `${targetEmoji} ${handoff.label}`,
                      )
                    : span({}, `${targetEmoji} ${handoff.label}`),
                ),
                handoff.prompt
                  ? p(
                      { className: "handoff-prompt text-muted" },
                      handoff.prompt,
                    )
                  : null,
              );
            }),
          ),
        )
      : null,
  );

  render(page);
}

/**
 * Stage formatting for DOM output
 */

import { div, h2, p, a, span, ul, li } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { prepareStageDetail, getStageEmoji } from "./shared.js";
import { createJsonLdScript, stageToJsonLd } from "../json-ld.js";

/**
 * Format stage detail as DOM elements
 * @param {Object} stage - Raw stage entity
 * @param {Object} context - Additional context
 * @param {Array} [context.stages] - All stages (for handoff links)
 * @param {boolean} [context.showBackLink=true] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function stageToDOM(stage, { stages = [], showBackLink = true } = {}) {
  const view = prepareStageDetail(stage);
  const emoji = getStageEmoji(stages, stage.id);

  return div(
    { className: "detail-page stage-detail" },
    // JSON-LD structured data
    createJsonLdScript(stageToJsonLd(stage)),
    // Header
    div(
      { className: "page-header" },
      showBackLink ? createBackLink("/stage", "← Back to Stages") : null,
      div(
        { className: "page-title-row" },
        span({ className: "page-title" }, `${emoji} ${view.name}`),
      ),
      p({ className: "page-description" }, view.description),
    ),

    // Read/Confirm Checklists
    view.readChecklist.length > 0 || view.confirmChecklist.length > 0
      ? div(
          { className: "section section-detail" },
          div(
            { className: "content-columns" },
            // Read checklist column
            view.readChecklist.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Read Checklist"),
                  ul(
                    { className: "criteria-list" },
                    ...view.readChecklist.map((item) =>
                      li({ className: "criteria-item" }, item),
                    ),
                  ),
                )
              : null,
            // Confirm checklist column
            view.confirmChecklist.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Confirm Checklist"),
                  ul(
                    { className: "criteria-list" },
                    ...view.confirmChecklist.map((item) =>
                      li({ className: "criteria-item" }, item),
                    ),
                  ),
                )
              : null,
          ),
        )
      : null,

    // Constraints
    view.constraints.length > 0
      ? div(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Constraints"),
          ul(
            { className: "constraint-list" },
            ...view.constraints.map((item) =>
              li({ className: "constraint-item" }, `⚠️ ${item}`),
            ),
          ),
        )
      : null,

    // Handoffs
    view.handoffs.length > 0
      ? div(
          { className: "section section-detail" },
          h2({ className: "section-title" }, "Handoffs"),
          div(
            { className: "handoff-list" },
            ...view.handoffs.map((handoff) => {
              const targetStage = stages.find((s) => s.id === handoff.target);
              const targetEmoji = getStageEmoji(stages, handoff.target);
              return div(
                { className: "handoff-card" },
                div(
                  { className: "handoff-header" },
                  showBackLink && targetStage
                    ? a(
                        { href: `#/stage/${handoff.target}` },
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
}

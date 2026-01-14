/**
 * Interview formatting for DOM output
 */

import { div, heading1, heading2, p, span } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelDots } from "../../components/detail.js";
import { getConceptEmoji } from "../../model/levels.js";

/**
 * Format interview detail as DOM elements
 * @param {Object} view - Interview detail view from presenter
 * @param {Object} typeConfig - Interview type configuration
 * @param {Object} options - Formatting options
 * @param {Object} [options.framework] - Framework data for emoji lookup
 * @param {boolean} [options.showBackLink] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function interviewToDOM(
  view,
  typeConfig,
  { framework, showBackLink = true } = {},
) {
  const skillEmoji = getConceptEmoji(framework, "skill");
  const behaviourEmoji = getConceptEmoji(framework, "behaviour");
  return div(
    { className: "detail-page interview-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/interview", "← Back to Interview Builder")
        : null,
      heading1({ className: "page-title" }, "💬 Interview: ", view.name),
      p({ className: "page-description" }, view.description),
      typeConfig
        ? p({ className: "text-muted" }, `Type: ${typeConfig.label}`)
        : null,
    ),

    // Questions by skill
    view.questionsBySkill && view.questionsBySkill.length > 0
      ? div(
          { className: "detail-section" },
          heading2(
            { className: "section-title" },
            `${skillEmoji} Skill Questions`,
          ),
          ...view.questionsBySkill.map((group) =>
            div(
              { className: "question-group" },
              p(
                { className: "question-group-title" },
                span({ className: "skill-name" }, group.skillName),
                " ",
                createLevelDots(group.levelIndex, group.totalLevels),
              ),
              div(
                { className: "question-list" },
                ...group.questions.map((q) =>
                  p({ className: "question-text" }, q.text),
                ),
              ),
            ),
          ),
        )
      : null,

    // Questions by behaviour
    view.questionsByBehaviour && view.questionsByBehaviour.length > 0
      ? div(
          { className: "detail-section" },
          heading2(
            { className: "section-title" },
            `${behaviourEmoji} Behaviour Questions`,
          ),
          ...view.questionsByBehaviour.map((group) =>
            div(
              { className: "question-group" },
              p(
                { className: "question-group-title" },
                span({ className: "behaviour-name" }, group.behaviourName),
                " ",
                createLevelDots(group.levelIndex, group.totalLevels),
              ),
              div(
                { className: "question-list" },
                ...group.questions.map((q) =>
                  p({ className: "question-text" }, q.text),
                ),
              ),
            ),
          ),
        )
      : null,
  );
}

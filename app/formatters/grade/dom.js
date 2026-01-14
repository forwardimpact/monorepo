/**
 * Grade formatting for DOM output
 */

import {
  div,
  heading1,
  heading2,
  p,
  span,
  table,
  tbody,
  thead,
  tr,
  th,
  td,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelDots } from "../../components/detail.js";
import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
  getConceptEmoji,
} from "../../model/levels.js";
import { createJobBuilderButton } from "../../components/action-buttons.js";
import { prepareGradeDetail } from "./shared.js";

/**
 * Format grade detail as DOM elements
 * @param {Object} grade - Raw grade entity
 * @param {Object} options - Formatting options
 * @param {Object} [options.framework] - Framework config for emojis
 * @param {boolean} [options.showBackLink=true] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function gradeToDOM(grade, { framework, showBackLink = true } = {}) {
  const view = prepareGradeDetail(grade);
  const emoji = framework ? getConceptEmoji(framework, "grade") : "📊";
  return div(
    { className: "detail-page grade-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink ? createBackLink("/grade", "← Back to Grades") : null,
      heading1({ className: "page-title" }, `${emoji} `, view.displayName),
      div(
        { className: "page-meta" },
        span({ className: "badge badge-default" }, view.id),
      ),
      view.typicalExperienceRange
        ? p(
            { className: "page-description" },
            `Typical experience: ${view.typicalExperienceRange}`,
          )
        : null,
      showBackLink
        ? div(
            { className: "page-actions" },
            createJobBuilderButton({
              paramName: "grade",
              paramValue: grade.id,
            }),
          )
        : null,
    ),

    // Titles section
    view.professionalTitle || view.managementTitle
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Titles"),
          div(
            { className: "content-columns" },
            view.professionalTitle
              ? div(
                  { className: "list-item" },
                  p({ className: "label" }, "Professional Track"),
                  p({}, view.professionalTitle),
                )
              : null,
            view.managementTitle
              ? div(
                  { className: "list-item" },
                  p({ className: "label" }, "Management Track"),
                  p({}, view.managementTitle),
                )
              : null,
          ),
        )
      : null,

    // Expectations
    view.expectations && Object.keys(view.expectations).length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Expectations"),
          div(
            { className: "content-columns" },
            ...Object.entries(view.expectations).map(([key, value]) =>
              div(
                { className: "list-item" },
                p(
                  { className: "label" },
                  key.charAt(0).toUpperCase() + key.slice(1),
                ),
                p({}, value),
              ),
            ),
          ),
        )
      : null,

    // Base Skill Levels and Base Behaviour Maturity in two columns
    div(
      { className: "detail-section" },
      div(
        { className: "content-columns" },
        // Base Skill Levels column
        div(
          { className: "column" },
          heading2({ className: "section-title" }, "Base Skill Levels"),
          table(
            { className: "level-table" },
            thead({}, tr({}, th({}, "Type"), th({}, "Level"))),
            tbody(
              {},
              tr(
                {},
                td({}, span({ className: "badge badge-primary" }, "Primary")),
                td(
                  {},
                  view.baseSkillLevels?.primary
                    ? createLevelDots(
                        SKILL_LEVEL_ORDER.indexOf(view.baseSkillLevels.primary),
                        SKILL_LEVEL_ORDER.length,
                      )
                    : span({ className: "text-muted" }, "—"),
                ),
              ),
              tr(
                {},
                td(
                  {},
                  span({ className: "badge badge-secondary" }, "Secondary"),
                ),
                td(
                  {},
                  view.baseSkillLevels?.secondary
                    ? createLevelDots(
                        SKILL_LEVEL_ORDER.indexOf(
                          view.baseSkillLevels.secondary,
                        ),
                        SKILL_LEVEL_ORDER.length,
                      )
                    : span({ className: "text-muted" }, "—"),
                ),
              ),
              tr(
                {},
                td({}, span({ className: "badge badge-broad" }, "Broad")),
                td(
                  {},
                  view.baseSkillLevels?.broad
                    ? createLevelDots(
                        SKILL_LEVEL_ORDER.indexOf(view.baseSkillLevels.broad),
                        SKILL_LEVEL_ORDER.length,
                      )
                    : span({ className: "text-muted" }, "—"),
                ),
              ),
            ),
          ),
        ),
        // Base Behaviour Maturity column
        div(
          { className: "column" },
          heading2({ className: "section-title" }, "Base Behaviour Maturity"),
          view.baseBehaviourMaturity
            ? table(
                { className: "level-table" },
                thead({}, tr({}, th({}, "Maturity"), th({}, "Level"))),
                tbody(
                  {},
                  tr(
                    {},
                    td(
                      {},
                      view.baseBehaviourMaturity.charAt(0).toUpperCase() +
                        view.baseBehaviourMaturity.slice(1),
                    ),
                    td(
                      {},
                      createLevelDots(
                        BEHAVIOUR_MATURITY_ORDER.indexOf(
                          view.baseBehaviourMaturity,
                        ),
                        BEHAVIOUR_MATURITY_ORDER.length,
                      ),
                    ),
                  ),
                ),
              )
            : p({ className: "text-muted" }, "—"),
        ),
      ),
    ),
  );
}

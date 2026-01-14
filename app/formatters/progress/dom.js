/**
 * Progress formatting for DOM output
 */

import {
  div,
  heading1,
  heading2,
  p,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  span,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelDots } from "../../components/detail.js";

/**
 * Format progress detail as DOM elements
 * @param {Object} view - Progress detail view from presenter
 * @param {Object} options - Formatting options
 * @param {boolean} options.showBackLink - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function progressToDOM(view, { showBackLink = true } = {}) {
  return div(
    { className: "detail-page progress-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/progress", "← Back to Progress Tracking")
        : null,
      heading1({ className: "page-title" }, "📈 ", view.name),
      p({ className: "page-description" }, view.description),
    ),

    // Skill changes
    view.skillChanges && view.skillChanges.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Skill Changes"),
          table(
            { className: "progression-table" },
            thead(
              {},
              tr(
                {},
                th({}, "Skill"),
                th({}, "Change"),
                th({}, "Expected Level"),
              ),
            ),
            tbody(
              {},
              ...view.skillChanges.map((change) =>
                tr(
                  {},
                  td({}, change.skillName),
                  td(
                    {},
                    span(
                      {
                        className: `modifier modifier-${change.modifier > 0 ? "positive" : "negative"}`,
                      },
                      change.modifier > 0
                        ? `+${change.modifier}`
                        : String(change.modifier),
                    ),
                  ),
                  td(
                    {},
                    createLevelDots(
                      change.expectedLevelIndex,
                      change.totalLevels,
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : null,

    // Behaviour changes
    view.behaviourChanges && view.behaviourChanges.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Behaviour Changes"),
          table(
            { className: "progression-table" },
            thead(
              {},
              tr(
                {},
                th({}, "Behaviour"),
                th({}, "Change"),
                th({}, "Expected Level"),
              ),
            ),
            tbody(
              {},
              ...view.behaviourChanges.map((change) =>
                tr(
                  {},
                  td({}, change.behaviourName),
                  td(
                    {},
                    span(
                      {
                        className: `modifier modifier-${change.modifier > 0 ? "positive" : "negative"}`,
                      },
                      change.modifier > 0
                        ? `+${change.modifier}`
                        : String(change.modifier),
                    ),
                  ),
                  td(
                    {},
                    createLevelDots(
                      change.expectedLevelIndex,
                      change.totalLevels,
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : null,
  );
}

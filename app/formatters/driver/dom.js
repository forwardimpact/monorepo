/**
 * Driver formatting for DOM output
 */

import { div, heading1, heading2, p, a, span } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { prepareDriverDetail } from "./shared.js";
import { getConceptEmoji } from "../../model/levels.js";
import { createJsonLdScript, driverToJsonLd } from "../json-ld.js";

/**
 * Format driver detail as DOM elements
 * @param {Object} driver - Raw driver entity
 * @param {Object} context - Additional context and options
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Object} [context.framework] - Framework config for emojis
 * @param {boolean} [context.showBackLink=true] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function driverToDOM(
  driver,
  { skills, behaviours, framework, showBackLink = true } = {},
) {
  const view = prepareDriverDetail(driver, { skills, behaviours });
  const emoji = framework ? getConceptEmoji(framework, "driver") : "🎯";
  return div(
    { className: "detail-page driver-detail" },
    // JSON-LD structured data
    createJsonLdScript(driverToJsonLd(driver, { skills, behaviours })),
    // Header
    div(
      { className: "page-header" },
      showBackLink ? createBackLink("/driver", "← Back to Drivers") : null,
      heading1({ className: "page-title" }, `${emoji} `, view.name),
      p({ className: "page-description" }, view.description),
    ),

    // Stats
    div(
      { className: "stats" },
      div(
        { className: "stat" },
        div(
          { className: "stat-value" },
          String(view.contributingSkills.length),
        ),
        div({ className: "stat-label" }, "Contributing Skills"),
      ),
      div(
        { className: "stat" },
        div(
          { className: "stat-value" },
          String(view.contributingBehaviours.length),
        ),
        div({ className: "stat-label" }, "Contributing Behaviours"),
      ),
    ),

    // Contributing Skills and Contributing Behaviours in two columns
    view.contributingSkills.length > 0 || view.contributingBehaviours.length > 0
      ? div(
          { className: "detail-section" },
          div(
            { className: "content-columns" },
            // Contributing Skills column
            view.contributingSkills.length > 0
              ? div(
                  { className: "column" },
                  heading2(
                    { className: "section-title" },
                    "Contributing Skills",
                  ),
                  ...view.contributingSkills.map((s) =>
                    div(
                      { className: "list-item" },
                      showBackLink
                        ? a({ href: `#/skill/${s.id}` }, s.name)
                        : span({}, s.name),
                    ),
                  ),
                )
              : null,
            // Contributing Behaviours column
            view.contributingBehaviours.length > 0
              ? div(
                  { className: "column" },
                  heading2(
                    { className: "section-title" },
                    "Contributing Behaviours",
                  ),
                  ...view.contributingBehaviours.map((b) =>
                    div(
                      { className: "list-item" },
                      showBackLink
                        ? a({ href: `#/behaviour/${b.id}` }, b.name)
                        : span({}, b.name),
                    ),
                  ),
                )
              : null,
          ),
        )
      : null,
  );
}

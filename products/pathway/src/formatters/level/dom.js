/**
 * Level formatting for DOM output
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
  formatLevel,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelDots } from "../../components/detail.js";
import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
  getConceptEmoji,
} from "@forwardimpact/map/levels";
import { createJobBuilderButton } from "../../components/action-buttons.js";
import { prepareLevelDetail } from "./shared.js";
import { createJsonLdScript, levelToJsonLd } from "../json-ld.js";

/**
 * Format level detail as DOM elements
 * @param {Object} level - Raw level entity
 * @param {Object} options - Formatting options
 * @param {Object} [options.framework] - Framework config for emojis
 * @param {boolean} [options.showBackLink=true] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
/**
 * Create a proficiency row for the base skill table
 * @param {string} label
 * @param {string} badgeClass
 * @param {string|undefined} proficiency
 * @returns {HTMLElement}
 */
function createProficiencyRow(label, badgeClass, proficiency) {
  return tr(
    {},
    td({}, span({ className: `badge ${badgeClass}` }, label)),
    td(
      {},
      proficiency
        ? createLevelDots(
            SKILL_PROFICIENCY_ORDER.indexOf(proficiency),
            SKILL_PROFICIENCY_ORDER.length,
          )
        : span({ className: "text-muted" }, "—"),
    ),
  );
}

/**
 * Create the base skill proficiencies and behaviour maturity section
 * @param {Object} view
 * @returns {HTMLElement}
 */
function createBaseProfileSection(view) {
  const profs = view.baseSkillProficiencies || {};
  return div(
    { className: "detail-section" },
    div(
      { className: "content-columns" },
      div(
        { className: "column" },
        heading2({ className: "section-title" }, "Base Skill Proficiencies"),
        table(
          { className: "level-table" },
          thead({}, tr({}, th({}, "Type"), th({}, "Level"))),
          tbody(
            {},
            createProficiencyRow("Primary", "badge-primary", profs.primary),
            createProficiencyRow(
              "Secondary",
              "badge-secondary",
              profs.secondary,
            ),
            createProficiencyRow("Broad", "badge-broad", profs.broad),
          ),
        ),
      ),
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
  );
}

export function levelToDOM(level, { framework, showBackLink = true } = {}) {
  const view = prepareLevelDetail(level);
  const emoji = framework ? getConceptEmoji(framework, "level") : "📊";
  return div(
    { className: "detail-page level-detail" },
    createJsonLdScript(levelToJsonLd(level)),
    div(
      { className: "page-header" },
      showBackLink ? createBackLink("/level", "← Back to Levels") : null,
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
              paramName: "level",
              paramValue: level.id,
            }),
          )
        : null,
    ),

    view.professionalTitle || view.managementTitle
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Titles"),
          div(
            { className: "content-columns" },
            view.professionalTitle
              ? div(
                  { className: "card" },
                  p({ className: "label" }, "Professional Track"),
                  p({ className: "card-description" }, view.professionalTitle),
                )
              : null,
            view.managementTitle
              ? div(
                  { className: "card" },
                  p({ className: "label" }, "Management Track"),
                  p({ className: "card-description" }, view.managementTitle),
                )
              : null,
          ),
        )
      : null,

    view.expectations && Object.keys(view.expectations).length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Expectations"),
          div(
            { className: "content-columns" },
            ...Object.entries(view.expectations).map(([key, value]) =>
              div(
                { className: "card" },
                p({ className: "label" }, formatLevel(key)),
                p({ className: "card-description" }, value),
              ),
            ),
          ),
        )
      : null,

    createBaseProfileSection(view),
  );
}

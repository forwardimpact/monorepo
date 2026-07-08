/**
 * Discipline formatting for DOM output
 */

import {
  a,
  div,
  heading1,
  heading2,
  heading3,
  p,
  span,
  ul,
  li,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import {
  createJobBuilderButton,
  createInterviewPrepButton,
} from "../../components/action-buttons.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";
import { prepareDisciplineDetail } from "./shared.js";
import { formatModifier } from "../shared.js";
import { createJsonLdScript, disciplineToJsonLd } from "../json-ld.js";
import { createBadge } from "../../components/card.js";

/**
 * Get type badges for discipline (Management/Professional)
 * @param {Object} discipline - Raw discipline entity
 * @returns {HTMLElement[]}
 */
function getDisciplineTypeBadges(discipline) {
  const badges = [];
  if (discipline.isProfessional) {
    badges.push(createBadge("Professional", "secondary"));
  }
  if (discipline.isManagement) {
    badges.push(createBadge("Management", "primary"));
  }
  return badges;
}

/**
 * Format discipline detail as DOM elements
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context and options
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Object} [context.standard] - Standard data for emoji lookup
 * @param {boolean} [context.showBackLink=true] - Whether to show back navigation link
 * @param {boolean} [context.showBehaviourModifiers=true] - Whether to show behaviour modifiers section
 * @returns {HTMLElement}
 */
export function disciplineToDOM(
  discipline,
  {
    skills,
    behaviours,
    standard,
    showBackLink = true,
    showBehaviourModifiers = true,
  } = {},
) {
  const view = prepareDisciplineDetail(discipline, { skills, behaviours });
  const emoji = getConceptEmoji(standard, "discipline");
  const typeBadges = getDisciplineTypeBadges(discipline);
  return div(
    { className: "detail-page discipline-detail" },
    // JSON-LD structured data
    createJsonLdScript(disciplineToJsonLd(discipline, { skills })),
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/discipline", "← Back to Disciplines")
        : null,
      div(
        { className: "page-title-row" },
        heading1({ className: "page-title" }, `${emoji} `, view.name),
        typeBadges.length > 0
          ? div({ className: "page-title-badges" }, ...typeBadges)
          : null,
      ),
      p({ className: "page-description" }, view.description),
      showBackLink
        ? div(
            { className: "page-actions" },
            createJobBuilderButton({
              paramName: "discipline",
              paramValue: discipline.id,
            }),
            createInterviewPrepButton({
              paramName: "discipline",
              paramValue: discipline.id,
            }),
          )
        : null,
    ),

    // Stats
    div(
      { className: "stats" },
      div(
        { className: "stat" },
        div({ className: "stat-value" }, String(view.coreSkills.length)),
        div({ className: "stat-label" }, "Core Skills"),
      ),
      div(
        { className: "stat" },
        div({ className: "stat-value" }, String(view.supportingSkills.length)),
        div({ className: "stat-label" }, "Supporting Skills"),
      ),
      div(
        { className: "stat" },
        div({ className: "stat-value" }, String(view.broadSkills.length)),
        div({ className: "stat-label" }, "Broad Skills"),
      ),
    ),

    // Skills sections - all three columns
    div(
      { className: "detail-section" },
      heading2({ className: "section-title" }, "Skill Profile"),
      div(
        { className: "content-columns" },
        // Core skills
        div(
          {},
          heading3(
            {},
            span({ className: "badge badge-primary" }, "Core Skills"),
          ),
          view.coreSkills.length > 0
            ? ul(
                { className: "related-list" },
                ...view.coreSkills.map((s) =>
                  li(
                    {},
                    showBackLink
                      ? a({ href: `#/skill/${s.id}` }, s.name)
                      : span({}, s.name),
                  ),
                ),
              )
            : p({ className: "text-muted" }, "None"),
        ),
        // Supporting skills
        div(
          {},
          heading3(
            {},
            span({ className: "badge badge-secondary" }, "Supporting Skills"),
          ),
          view.supportingSkills.length > 0
            ? ul(
                { className: "related-list" },
                ...view.supportingSkills.map((s) =>
                  li(
                    {},
                    showBackLink
                      ? a({ href: `#/skill/${s.id}` }, s.name)
                      : span({}, s.name),
                  ),
                ),
              )
            : p({ className: "text-muted" }, "None"),
        ),
        // Broad skills
        div(
          {},
          heading3(
            {},
            span({ className: "badge badge-broad" }, "Broad Skills"),
          ),
          view.broadSkills.length > 0
            ? ul(
                { className: "related-list" },
                ...view.broadSkills.map((s) =>
                  li(
                    {},
                    showBackLink
                      ? a({ href: `#/skill/${s.id}` }, s.name)
                      : span({}, s.name),
                  ),
                ),
              )
            : p({ className: "text-muted" }, "None"),
        ),
      ),
    ),

    // Behaviour modifiers
    showBehaviourModifiers && view.behaviourModifiers.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Behaviour Modifiers"),
          ...view.behaviourModifiers.map((b) =>
            div(
              { className: "list-item" },
              showBackLink
                ? a({ href: `#/behaviour/${b.id}` }, b.name)
                : span({}, b.name),
              " ",
              span(
                {
                  className: `modifier ${b.modifier > 0 ? "modifier-positive" : b.modifier < 0 ? "modifier-negative" : "modifier-neutral"}`,
                },
                formatModifier(b.modifier),
              ),
            ),
          ),
        )
      : null,
  );
}

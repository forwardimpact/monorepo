/**
 * Progress formatter for DOM output
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
import {
  createLevelCell,
  createEmptyLevelCell,
} from "../../components/detail.js";
import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "@forwardimpact/libskill/levels";
import { formatModifier } from "../shared.js";

/**
 * Create one change row with a from and a to level bar
 * @param {string} name - Skill or behaviour name
 * @param {string|null} fromLevel - Level before the move, null when gained
 * @param {string} toLevel - Level after the move
 * @param {number} change - Level change as a signed count
 * @param {string[]} order - Ordered level scale
 * @returns {HTMLElement}
 */
function createChangeRow(name, fromLevel, toLevel, change, order) {
  return tr(
    {},
    td({}, name),
    fromLevel ? createLevelCell(fromLevel, order) : createEmptyLevelCell(),
    createLevelCell(toLevel, order),
    td(
      {},
      span(
        {
          className: `modifier modifier-${change > 0 ? "positive" : "negative"}`,
        },
        formatModifier(change),
      ),
    ),
  );
}

/**
 * Create a changes table section
 * @param {string} title - Section heading
 * @param {string} nameHeader - Header for the name column
 * @param {HTMLElement[]} rows - Change rows
 * @returns {HTMLElement|null}
 */
function createChangesSection(title, nameHeader, rows) {
  if (rows.length === 0) return null;
  return div(
    { className: "detail-section" },
    heading2({ className: "section-title" }, title),
    table(
      { className: "progression-table" },
      thead(
        {},
        tr(
          {},
          th({}, nameHeader),
          th({}, "Current"),
          th({}, "Target"),
          th({}, "Change"),
        ),
      ),
      tbody({}, ...rows),
    ),
  );
}

/**
 * Format progress detail as DOM elements
 * @param {Object} view - Progress detail view from prepareProgressDetail
 * @param {Object} options - Formatting options
 * @param {boolean} options.showBackLink - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function progressToDOM(view, { showBackLink = true } = {}) {
  const skillRows = (view.skillChanges || [])
    .filter((s) => s.proficiencyChange !== 0)
    .map((s) =>
      createChangeRow(
        s.name,
        s.fromLevel,
        s.toLevel,
        s.proficiencyChange,
        SKILL_PROFICIENCY_ORDER,
      ),
    );

  const behaviourRows = (view.behaviourChanges || [])
    .filter((b) => b.maturityChange !== 0)
    .map((b) =>
      createChangeRow(
        b.name,
        b.fromMaturity,
        b.toMaturity,
        b.maturityChange,
        BEHAVIOUR_MATURITY_ORDER,
      ),
    );

  const skillSection = createChangesSection(
    "Skill Changes",
    "Skill",
    skillRows,
  );
  const behaviourSection = createChangesSection(
    "Behaviour Changes",
    "Behaviour",
    behaviourRows,
  );

  return div(
    { className: "detail-page progress-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/progress", "← Back to Progress Tracking")
        : null,
      heading1({ className: "page-title" }, "📈 Career Progression"),
      p(
        { className: "page-description" },
        `${view.fromTitle} → ${view.toTitle}`,
      ),
    ),

    skillSection,
    behaviourSection,

    !skillSection && !behaviourSection
      ? p({ className: "text-muted" }, "This progression requires no changes.")
      : null,
  );
}

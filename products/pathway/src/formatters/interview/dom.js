/**
 * Interview formatter for DOM output
 */

import { div, heading1, heading2, p, span } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelBar } from "../../components/detail.js";
import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
  getConceptEmoji,
} from "@forwardimpact/libskill/levels";

/**
 * Create one question group with its target level bar
 *
 * Capability sections target a skill proficiency, so they share the skill
 * scale. Behaviour sections use the maturity scale.
 * @param {Object} section - Section from the interview view
 * @param {string} nameClass - Class for the target name
 * @param {string[]} order - Ordered level scale for this section type
 * @returns {HTMLElement}
 */
function createQuestionGroup(section, nameClass, order) {
  return div(
    { className: "question-group" },
    p(
      { className: "question-group-title" },
      span({ className: nameClass }, section.name),
      " ",
      createLevelBar(section.level, order),
    ),
    div(
      { className: "question-list" },
      ...section.questions.map((q) =>
        p({ className: "question-text" }, q.question),
      ),
    ),
  );
}

/**
 * Create a section of question groups
 * @param {Array} sections - Sections of one target type
 * @param {string} title - Section heading
 * @param {string} nameClass - Class for the target name
 * @param {string[]} order - Ordered level scale for this section type
 * @returns {HTMLElement|null}
 */
function createQuestionSection(sections, title, nameClass, order) {
  if (sections.length === 0) return null;
  return div(
    { className: "detail-section" },
    heading2({ className: "section-title" }, title),
    ...sections.map((section) =>
      createQuestionGroup(section, nameClass, order),
    ),
  );
}

/**
 * Format interview detail as DOM elements
 * @param {Object} view - Interview detail view from prepareInterviewDetail
 * @param {Object} typeConfig - Interview type configuration
 * @param {Object} options - Formatting options
 * @param {Object} [options.standard] - Standard data for emoji lookup
 * @param {boolean} [options.showBackLink] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function interviewToDOM(
  view,
  typeConfig,
  { standard, showBackLink = true } = {},
) {
  const skillEmoji = getConceptEmoji(standard, "skill");
  const behaviourEmoji = getConceptEmoji(standard, "behaviour");
  const sections = view.sections || [];
  const type = typeConfig || view.typeInfo;

  return div(
    { className: "detail-page interview-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/interview", "← Back to Interview Builder")
        : null,
      heading1({ className: "page-title" }, "💬 Interview: ", view.title),
      type ? p({ className: "page-description" }, type.description) : null,
      p(
        { className: "text-muted" },
        `${view.totalQuestions} questions · ${view.expectedDurationMinutes} minutes`,
      ),
    ),

    createQuestionSection(
      sections.filter((s) => s.type === "skill"),
      `${skillEmoji} Skill Questions`,
      "skill-name",
      SKILL_PROFICIENCY_ORDER,
    ),

    createQuestionSection(
      sections.filter((s) => s.type === "capability"),
      "🧩 Decomposition Questions",
      "capability-name",
      SKILL_PROFICIENCY_ORDER,
    ),

    createQuestionSection(
      sections.filter((s) => s.type === "behaviour"),
      `${behaviourEmoji} Behaviour Questions`,
      "behaviour-name",
      BEHAVIOUR_MATURITY_ORDER,
    ),
  );
}

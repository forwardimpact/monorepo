/**
 * Self-assessment wizard step renderers
 */

import { div, h2, h3, h4, p, span, button, a } from "../lib/render.js";
import { createBadge } from "../components/card.js";
import { createDisciplineSelect } from "../lib/form-controls.js";
import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
  getConceptEmoji,
} from "@forwardimpact/map/levels";
import { formatLevel } from "../lib/render.js";

/**
 * Create a tip card
 * @param {string} icon
 * @param {string} title
 * @param {string} text
 * @returns {HTMLElement}
 */
function createTipCard(icon, title, text) {
  return div(
    { className: "tip-card" },
    span({ className: "tip-icon" }, icon),
    h4({}, title),
    p({}, text),
  );
}

/**
 * Create a level selection button
 * @param {Object} item - Skill or behaviour
 * @param {string} level - Level value
 * @param {number} index - Level index
 * @param {string} type - 'skill' or 'behaviour'
 * @param {Object} assessmentState - Assessment state ref
 * @param {Function} rerender - Function to trigger re-render
 * @returns {HTMLElement}
 */
export function createLevelButton(
  item,
  level,
  index,
  type,
  assessmentState,
  rerender,
) {
  const stateKey = type === "skill" ? "skills" : "behaviours";
  const currentLevel = assessmentState[stateKey][item.id];
  const isSelected = currentLevel === level;
  const proficiencyDescriptions =
    type === "skill" ? item.proficiencyDescriptions : item.maturityDescriptions;
  const description = proficiencyDescriptions?.[level] || "";

  return button(
    {
      className: `level-btn level-${index + 1} ${isSelected ? "selected" : ""}`,
      title: `${formatLevel(level)}: ${description}`,
      onClick: () => {
        assessmentState[stateKey][item.id] = level;
        rerender();
      },
    },
    span({ className: "level-btn-number" }, String(index + 1)),
    span({ className: "level-btn-name" }, formatLevel(level)),
  );
}

/**
 * Render introduction step
 * @param {Object} data - App data
 * @param {Object} assessmentState - Assessment state
 * @returns {HTMLElement}
 */
export function renderIntroStep(data, assessmentState) {
  return div(
    { className: "assessment-step assessment-intro" },
    div(
      { className: "intro-card" },
      h2({}, "Welcome to the Self-Assessment"),
      p(
        {},
        "This assessment helps you understand your current skill proficiencies and behaviours, " +
          "then matches you with suitable roles in the organization.",
      ),

      div(
        { className: "intro-info" },
        div(
          { className: "info-item" },
          span(
            { className: "info-icon" },
            getConceptEmoji(data.framework, "skill"),
          ),
          div(
            {},
            h4({}, `${data.skills.length} Skills`),
            p({}, "Across " + data.capabilities.length + " capabilities"),
          ),
        ),
        div(
          { className: "info-item" },
          span(
            { className: "info-icon" },
            getConceptEmoji(data.framework, "behaviour"),
          ),
          div(
            {},
            h4({}, `${data.behaviours.length} Behaviours`),
            p({}, "Key mindsets and ways of working"),
          ),
        ),
        div(
          { className: "info-item" },
          span({ className: "info-icon" }, "⏱️"),
          div({}, h4({}, "10-15 Minutes"), p({}, "Complete at your own pace")),
        ),
      ),

      div(
        { className: "discipline-filter" },
        h3({}, "Optional: Focus on a Discipline"),
        p(
          { className: "text-muted" },
          "Select a discipline to highlight which skills are most relevant for that role. " +
            "You can still assess all skills.",
        ),
        createDisciplineSelect({
          id: "discipline-filter-select",
          disciplines: data.disciplines,
          initialValue: assessmentState.discipline || "",
          placeholder: "Select discipline",
          onChange: (value) => {
            assessmentState.discipline = value || null;
          },
          getDisplayName: (d) => d.specialization,
        }),
      ),

      div(
        { className: "intro-tips" },
        h3({}, "Tips for Accurate Self-Assessment"),
        div(
          { className: "auto-grid-sm" },
          createTipCard(
            "🎯",
            "Be Honest",
            "Rate yourself where you genuinely are, not where you aspire to be.",
          ),
          createTipCard(
            "📚",
            "Read Descriptions",
            "Hover over levels to see detailed descriptions for each.",
          ),
          createTipCard(
            "⏭️",
            "Skip if Unsure",
            "You can leave items unrated and come back later.",
          ),
          createTipCard(
            "💾",
            "Auto-Saved",
            "Your progress is kept while you navigate between steps.",
          ),
        ),
      ),
    ),
  );
}

/**
 * Create a skill assessment item
 * @param {Object} skill - Skill data
 * @param {string|null} relevance - Skill relevance for selected discipline
 * @param {Object} assessmentState
 * @param {Function} rerender
 * @returns {HTMLElement}
 */
function createSkillAssessmentItem(
  skill,
  relevance,
  assessmentState,
  rerender,
) {
  const currentLevel = assessmentState.skills[skill.id];

  return div(
    {
      className: `assessment-item ${currentLevel ? "assessed" : ""} ${relevance ? `relevance-${relevance}` : ""}`,
    },
    div(
      { className: "assessment-item-header" },
      div(
        { className: "assessment-item-title" },
        a({ href: `#/skill/${skill.id}` }, skill.name),
        relevance && createBadge(relevance, relevance),
      ),
      currentLevel &&
        span({ className: "current-level-badge" }, formatLevel(currentLevel)),
    ),

    p({ className: "assessment-item-description" }, skill.description),

    div(
      { className: "level-selector" },
      ...SKILL_PROFICIENCY_ORDER.map((level, index) =>
        createLevelButton(
          skill,
          level,
          index,
          "skill",
          assessmentState,
          rerender,
        ),
      ),
      button(
        {
          className: "level-clear-btn",
          title: "Clear selection",
          onClick: () => {
            delete assessmentState.skills[skill.id];
            rerender();
          },
        },
        "✕",
      ),
    ),
  );
}

/**
 * Render skills assessment step
 * @param {Object} step - Step configuration with capability and items
 * @param {Object} data - App data
 * @param {Object} assessmentState
 * @param {Function} rerender
 * @param {Function} formatCapability
 * @returns {HTMLElement}
 */
export function renderSkillsStep(
  step,
  data,
  assessmentState,
  rerender,
  formatCapability,
) {
  const { capability, items } = step;
  const selectedDiscipline = assessmentState.discipline
    ? data.disciplines.find((d) => d.id === assessmentState.discipline)
    : null;

  const getSkillRelevance = (skill) => {
    if (!selectedDiscipline) return null;
    if (selectedDiscipline.coreSkills?.includes(skill.id)) return "primary";
    if (selectedDiscipline.supportingSkills?.includes(skill.id))
      return "secondary";
    if (selectedDiscipline.broadSkills?.includes(skill.id)) return "broad";
    return null;
  };

  const sortedItems = [...items].sort((a, b) => {
    const relevanceA = getSkillRelevance(a);
    const relevanceB = getSkillRelevance(b);
    const order = { primary: 0, secondary: 1, broad: 2 };

    if (relevanceA && !relevanceB) return -1;
    if (!relevanceA && relevanceB) return 1;
    if (relevanceA && relevanceB) {
      return (order[relevanceA] ?? 3) - (order[relevanceB] ?? 3);
    }
    return a.name.localeCompare(b.name);
  });

  const assessedCount = items.filter(
    (item) => assessmentState.skills[item.id],
  ).length;

  return div(
    { className: "assessment-step" },
    div(
      { className: "step-header" },
      h2(
        {},
        span({ className: "step-header-icon" }, step.icon),
        ` ${formatCapability(capability, data.capabilities)} Skills`,
      ),
      span(
        { className: "step-progress" },
        `${assessedCount}/${items.length} rated`,
      ),
    ),

    selectedDiscipline &&
      div(
        { className: "discipline-context" },
        span({}, `Showing relevance for: `),
        span(
          { className: "discipline-name" },
          selectedDiscipline.specialization,
        ),
      ),

    div(
      { className: "assessment-items" },
      ...sortedItems.map((skill) =>
        createSkillAssessmentItem(
          skill,
          getSkillRelevance(skill),
          assessmentState,
          rerender,
        ),
      ),
    ),
  );
}

/**
 * Create a behaviour assessment item
 * @param {Object} behaviour - Behaviour data
 * @param {Object} assessmentState
 * @param {Function} rerender
 * @returns {HTMLElement}
 */
function createBehaviourAssessmentItem(behaviour, assessmentState, rerender) {
  const currentLevel = assessmentState.behaviours[behaviour.id];

  return div(
    { className: `assessment-item ${currentLevel ? "assessed" : ""}` },
    div(
      { className: "assessment-item-header" },
      div(
        { className: "assessment-item-title" },
        a({ href: `#/behaviour/${behaviour.id}` }, behaviour.name),
      ),
      currentLevel &&
        span({ className: "current-level-badge" }, formatLevel(currentLevel)),
    ),

    p({ className: "assessment-item-description" }, behaviour.description),

    div(
      { className: "level-selector" },
      ...BEHAVIOUR_MATURITY_ORDER.map((level, index) =>
        createLevelButton(
          behaviour,
          level,
          index,
          "behaviour",
          assessmentState,
          rerender,
        ),
      ),
      button(
        {
          className: "level-clear-btn",
          title: "Clear selection",
          onClick: () => {
            delete assessmentState.behaviours[behaviour.id];
            rerender();
          },
        },
        "✕",
      ),
    ),
  );
}

/**
 * Render behaviours assessment step
 * @param {Object} step - Step configuration
 * @param {Object} data - App data
 * @param {Object} assessmentState
 * @param {Function} rerender
 * @returns {HTMLElement}
 */
export function renderBehavioursStep(step, data, assessmentState, rerender) {
  const { items } = step;
  const assessedCount = items.filter(
    (item) => assessmentState.behaviours[item.id],
  ).length;

  return div(
    { className: "assessment-step" },
    div(
      { className: "step-header" },
      h2(
        {},
        span(
          { className: "step-header-icon" },
          getConceptEmoji(data.framework, "behaviour"),
        ),
        " Behaviours",
      ),
      span(
        { className: "step-progress" },
        `${assessedCount}/${items.length} rated`,
      ),
    ),

    p(
      { className: "step-intro" },
      "Behaviours describe how you approach work—your mindsets and ways of working. " +
        "These are equally important as technical skills.",
    ),

    div(
      { className: "assessment-items" },
      ...items.map((behaviour) =>
        createBehaviourAssessmentItem(behaviour, assessmentState, rerender),
      ),
    ),
  );
}

/**
 * Render results preview before navigating to full results
 * @param {Object} data - App data
 * @param {Object} assessmentState
 * @param {Function} calculateProgress
 * @returns {HTMLElement}
 */
export function renderResultsPreview(data, assessmentState, calculateProgress) {
  const progress = calculateProgress(data);
  const skillCount = Object.keys(assessmentState.skills).length;
  const behaviourCount = Object.keys(assessmentState.behaviours).length;

  if (progress < 20) {
    return div(
      { className: "assessment-step results-preview" },
      div(
        { className: "results-incomplete" },
        h2({}, "Complete More of the Assessment"),
        p(
          {},
          "Please complete at least 20% of the assessment to see job matches. " +
            `You've currently assessed ${skillCount} skills and ${behaviourCount} behaviours.`,
        ),
        div(
          { className: "progress-summary" },
          div(
            { className: "progress-bar large" },
            div({
              className: "progress-bar-fill",
              style: `width: ${progress}%`,
            }),
          ),
          span({}, `${progress}% complete`),
        ),
      ),
    );
  }

  return div(
    { className: "assessment-step results-preview" },
    div(
      { className: "results-ready" },
      h2({}, "🎉 Assessment Complete!"),
      p({}, "Great work! You're ready to see your job matches."),

      div(
        { className: "results-summary" },
        div(
          { className: "summary-stat" },
          span({ className: "summary-value" }, String(skillCount)),
          span({ className: "summary-label" }, "Skills Assessed"),
        ),
        div(
          { className: "summary-stat" },
          span({ className: "summary-value" }, String(behaviourCount)),
          span({ className: "summary-label" }, "Behaviours Assessed"),
        ),
        div(
          { className: "summary-stat" },
          span({ className: "summary-value" }, `${progress}%`),
          span({ className: "summary-label" }, "Complete"),
        ),
      ),

      div(
        { className: "results-actions" },
        button(
          {
            className: "btn btn-primary btn-lg",
            onClick: () => {
              window.location.hash = "/self-assessment/results";
            },
          },
          "View My Job Matches →",
        ),
      ),
    ),
  );
}

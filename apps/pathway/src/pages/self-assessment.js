/**
 * Self-assessment wizard page
 * A step-by-step interface for users to assess their skills and behaviours
 */

import {
  render,
  div,
  h1,
  h2,
  h3,
  h4,
  p,
  span,
  button,
  a,
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "../components/card.js";
import { createDisciplineSelect } from "../lib/form-controls.js";
import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
  groupSkillsByCapability,
  getCapabilityOrder,
  getCapabilityEmoji,
  getConceptEmoji,
} from "@forwardimpact/schema/levels";
import { formatLevel } from "../lib/render.js";

/**
 * Assessment state stored in memory
 * @type {{skills: Object, behaviours: Object, discipline: string|null, currentStep: number}}
 */
let assessmentState = {
  skills: {},
  behaviours: {},
  discipline: null,
  currentStep: 0,
};

/**
 * Reset assessment state
 */
export function resetAssessment() {
  assessmentState = {
    skills: {},
    behaviours: {},
    discipline: null,
    currentStep: 0,
  };
}

/**
 * Get current assessment state
 * @returns {Object}
 */
export function getAssessmentState() {
  return assessmentState;
}

/**
 * Get steps for the wizard
 * @param {Object} data - App data
 * @returns {Array<{id: string, name: string, icon: string, type: string, items?: Array}>}
 */
function getWizardSteps(data) {
  const { framework } = data;
  const skillsByCapability = groupSkillsByCapability(
    data.skills,
    data.capabilities,
  );
  const steps = [
    {
      id: "intro",
      name: "Start",
      icon: getConceptEmoji(framework, "driver"),
      type: "intro",
    },
  ];

  // Add a step for each non-empty skill capability
  for (const capability of getCapabilityOrder(data.capabilities)) {
    const skills = skillsByCapability[capability];
    if (skills && skills.length > 0) {
      steps.push({
        id: `skills-${capability}`,
        name: formatCapability(capability, data.capabilities),
        icon: getCapabilityEmoji(data.capabilities, capability),
        type: "skills",
        capability: capability,
        items: skills,
      });
    }
  }

  // Add behaviours step
  steps.push({
    id: "behaviours",
    name: "Behaviours",
    icon: getConceptEmoji(framework, "behaviour"),
    type: "behaviours",
    items: data.behaviours,
  });

  // Add results step
  steps.push({
    id: "results",
    name: "Results",
    icon: getConceptEmoji(framework, "grade"),
    type: "results",
  });

  return steps;
}

/**
 * Format capability name for display
 * @param {string} capabilityId
 * @param {Array} capabilities
 * @returns {string}
 */
function formatCapability(capabilityId, capabilities) {
  const capability = capabilities.find((c) => c.id === capabilityId);
  return capability?.name || capabilityId;
}

/**
 * Calculate progress percentage
 * @param {Object} data - App data
 * @returns {number}
 */
function calculateProgress(data) {
  const totalSkills = data.skills.length;
  const totalBehaviours = data.behaviours.length;
  const totalItems = totalSkills + totalBehaviours;

  if (totalItems === 0) return 0;

  const assessedSkills = Object.keys(assessmentState.skills).length;
  const assessedBehaviours = Object.keys(assessmentState.behaviours).length;
  const assessedItems = assessedSkills + assessedBehaviours;

  return Math.round((assessedItems / totalItems) * 100);
}

/**
 * Render the self-assessment wizard
 */
export function renderSelfAssessment() {
  const { data } = getState();
  const steps = getWizardSteps(data);
  const currentStep = Math.min(assessmentState.currentStep, steps.length - 1);
  const step = steps[currentStep];

  const page = div(
    { className: "self-assessment-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, "Self-Assessment"),
      p(
        { className: "page-description" },
        "Assess your skills and behaviours to find matching roles and identify development opportunities.",
      ),
    ),

    // Progress bar
    createProgressBar(data, steps, currentStep),

    // Step content
    div(
      { className: "assessment-content", id: "assessment-content" },
      renderStepContent(step, data),
    ),

    // Navigation buttons
    createNavigationButtons(steps, currentStep),
  );

  render(page);
}

/**
 * Create progress bar with step indicators
 * @param {Object} data - App data
 * @param {Array} steps - Wizard steps
 * @param {number} currentStep - Current step index
 * @returns {HTMLElement}
 */
function createProgressBar(data, steps, currentStep) {
  const progress = calculateProgress(data);

  return div(
    { className: "assessment-progress" },
    // Progress percentage
    div(
      { className: "progress-header" },
      span({ className: "progress-label" }, `${progress}% Complete`),
      span(
        { className: "progress-stats" },
        `${Object.keys(assessmentState.skills).length}/${data.skills.length} skills, ` +
          `${Object.keys(assessmentState.behaviours).length}/${data.behaviours.length} behaviours`,
      ),
    ),
    // Progress bar
    div(
      { className: "progress-bar" },
      div({ className: "progress-bar-fill", style: `width: ${progress}%` }),
    ),
    // Step indicators
    div(
      { className: "step-indicators" },
      ...steps.map((step, index) =>
        div(
          {
            className: `step-indicator ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`,
            onClick: () => {
              // Allow jumping to any step except results (unless assessment is complete)
              if (index < steps.length - 1 || calculateProgress(data) >= 50) {
                assessmentState.currentStep = index;
                renderSelfAssessment();
              }
            },
          },
          span({ className: "step-icon" }, step.icon),
          span({ className: "step-name" }, step.name),
        ),
      ),
    ),
  );
}

/**
 * Render content for the current step
 * @param {Object} step - Current step configuration
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function renderStepContent(step, data) {
  switch (step.type) {
    case "intro":
      return renderIntroStep(data);
    case "skills":
      return renderSkillsStep(step, data);
    case "behaviours":
      return renderBehavioursStep(step, data);
    case "results":
      return renderResultsPreview(data);
    default:
      return div({}, "Unknown step");
  }
}

/**
 * Render introduction step
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function renderIntroStep(data) {
  return div(
    { className: "assessment-step assessment-intro" },
    div(
      { className: "intro-card" },
      h2({}, "Welcome to the Self-Assessment"),
      p(
        {},
        "This assessment helps you understand your current skill levels and behaviours, " +
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

      // Optional discipline filter
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
 * Render skills assessment step
 * @param {Object} step - Step configuration with capability and items
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function renderSkillsStep(step, data) {
  const { capability, items } = step;
  const selectedDiscipline = assessmentState.discipline
    ? data.disciplines.find((d) => d.id === assessmentState.discipline)
    : null;

  // Determine skill relevance if a discipline is selected
  const getSkillRelevance = (skill) => {
    if (!selectedDiscipline) return null;
    if (selectedDiscipline.coreSkills?.includes(skill.id)) return "primary";
    if (selectedDiscipline.supportingSkills?.includes(skill.id))
      return "secondary";
    if (selectedDiscipline.broadSkills?.includes(skill.id)) return "broad";
    return null;
  };

  // Sort items: relevant skills first
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
        createSkillAssessmentItem(skill, getSkillRelevance(skill)),
      ),
    ),
  );
}

/**
 * Create a skill assessment item
 * @param {Object} skill - Skill data
 * @param {string|null} relevance - Skill relevance for selected discipline
 * @returns {HTMLElement}
 */
function createSkillAssessmentItem(skill, relevance) {
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
      ...SKILL_LEVEL_ORDER.map((level, index) =>
        createLevelButton(skill, level, index, "skill"),
      ),
      // Clear button
      button(
        {
          className: "level-clear-btn",
          title: "Clear selection",
          onClick: () => {
            delete assessmentState.skills[skill.id];
            renderSelfAssessment();
          },
        },
        "✕",
      ),
    ),
  );
}

/**
 * Create a level selection button
 * @param {Object} item - Skill or behaviour
 * @param {string} level - Level value
 * @param {number} index - Level index
 * @param {string} type - 'skill' or 'behaviour'
 * @returns {HTMLElement}
 */
function createLevelButton(item, level, index, type) {
  const stateKey = type === "skill" ? "skills" : "behaviours";
  const currentLevel = assessmentState[stateKey][item.id];
  const isSelected = currentLevel === level;
  const levelDescriptions =
    type === "skill" ? item.levelDescriptions : item.maturityDescriptions;
  const description = levelDescriptions?.[level] || "";

  return button(
    {
      className: `level-btn level-${index + 1} ${isSelected ? "selected" : ""}`,
      title: `${formatLevel(level)}: ${description}`,
      onClick: () => {
        assessmentState[stateKey][item.id] = level;
        renderSelfAssessment();
      },
    },
    span({ className: "level-btn-number" }, String(index + 1)),
    span({ className: "level-btn-name" }, formatLevel(level)),
  );
}

/**
 * Render behaviours assessment step
 * @param {Object} step - Step configuration
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function renderBehavioursStep(step, data) {
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
      ...items.map((behaviour) => createBehaviourAssessmentItem(behaviour)),
    ),
  );
}

/**
 * Create a behaviour assessment item
 * @param {Object} behaviour - Behaviour data
 * @returns {HTMLElement}
 */
function createBehaviourAssessmentItem(behaviour) {
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
        createLevelButton(behaviour, level, index, "behaviour"),
      ),
      // Clear button
      button(
        {
          className: "level-clear-btn",
          title: "Clear selection",
          onClick: () => {
            delete assessmentState.behaviours[behaviour.id];
            renderSelfAssessment();
          },
        },
        "✕",
      ),
    ),
  );
}

/**
 * Render results preview before navigating to full results
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function renderResultsPreview(data) {
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
              // Navigate to results page
              window.location.hash = "/self-assessment/results";
            },
          },
          "View My Job Matches →",
        ),
      ),
    ),
  );
}

/**
 * Create navigation buttons for the wizard
 * @param {Array} steps - Wizard steps
 * @param {number} currentStep - Current step index
 * @returns {HTMLElement}
 */
function createNavigationButtons(steps, currentStep) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return div(
    { className: "assessment-navigation" },
    button(
      {
        className: "btn btn-secondary",
        disabled: isFirstStep,
        onClick: () => {
          if (!isFirstStep) {
            assessmentState.currentStep = currentStep - 1;
            renderSelfAssessment();
          }
        },
      },
      "← Previous",
    ),

    span(
      { className: "step-counter" },
      `Step ${currentStep + 1} of ${steps.length}`,
    ),

    button(
      {
        className: "btn btn-primary",
        disabled: isLastStep,
        onClick: () => {
          if (!isLastStep) {
            assessmentState.currentStep = currentStep + 1;
            renderSelfAssessment();
          }
        },
      },
      "Next →",
    ),
  );
}

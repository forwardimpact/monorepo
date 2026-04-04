/**
 * Self-assessment wizard page
 * A step-by-step interface for users to assess their skills and behaviours
 */

import { render, div, h1, p, span, button } from "../lib/render.js";
import { getState } from "../lib/state.js";
import {
  groupSkillsByCapability,
  getCapabilityOrder,
  getCapabilityEmoji,
  getConceptEmoji,
} from "@forwardimpact/map/levels";
import {
  renderIntroStep,
  renderSkillsStep,
  renderBehavioursStep,
  renderResultsPreview,
} from "./self-assessment-steps.js";

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

  steps.push({
    id: "behaviours",
    name: "Behaviours",
    icon: getConceptEmoji(framework, "behaviour"),
    type: "behaviours",
    items: data.behaviours,
  });

  steps.push({
    id: "results",
    name: "Results",
    icon: getConceptEmoji(framework, "level"),
    type: "results",
  });

  return steps;
}

/**
 * Calculate progress percentage
 * @param {Object} data - App data
 * @returns {number}
 */
function calculateProgress(data) {
  const totalItems = data.skills.length + data.behaviours.length;
  if (totalItems === 0) return 0;

  const assessedItems =
    Object.keys(assessmentState.skills).length +
    Object.keys(assessmentState.behaviours).length;

  return Math.round((assessedItems / totalItems) * 100);
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
      return renderIntroStep(data, assessmentState);
    case "skills":
      return renderSkillsStep(
        step,
        data,
        assessmentState,
        renderSelfAssessment,
        formatCapability,
      );
    case "behaviours":
      return renderBehavioursStep(
        step,
        data,
        assessmentState,
        renderSelfAssessment,
      );
    case "results":
      return renderResultsPreview(data, assessmentState, calculateProgress);
    default:
      return div({}, "Unknown step");
  }
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
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, "Self-Assessment"),
      p(
        { className: "page-description" },
        "Assess your skills and behaviours to find matching roles and identify development opportunities.",
      ),
    ),
    createProgressBar(data, steps, currentStep),
    div(
      { className: "assessment-content", id: "assessment-content" },
      renderStepContent(step, data),
    ),
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
    div(
      { className: "progress-header" },
      span({ className: "progress-label" }, `${progress}% Complete`),
      span(
        { className: "progress-stats" },
        `${Object.keys(assessmentState.skills).length}/${data.skills.length} skills, ` +
          `${Object.keys(assessmentState.behaviours).length}/${data.behaviours.length} behaviours`,
      ),
    ),
    div(
      { className: "progress-bar" },
      div({ className: "progress-bar-fill", style: `width: ${progress}%` }),
    ),
    div(
      { className: "step-indicators" },
      ...steps.map((step, index) =>
        div(
          {
            className: `step-indicator ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`,
            onClick: () => {
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

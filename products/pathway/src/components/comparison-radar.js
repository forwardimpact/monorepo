/**
 * Comparison radar chart component
 * Displays two overlaid radar charts for comparing current vs target levels
 */

/** @typedef {import('../types.js').SkillMatrixItem} SkillMatrixItem */
/** @typedef {import('../types.js').BehaviourProfileItem} BehaviourProfileItem */

import { ComparisonRadarChart } from "../lib/radar.js";
import { div, h3 } from "../lib/render.js";
import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  formatLevel,
} from "../lib/render.js";
import { compareByCapability } from "@forwardimpact/libskill/policies";

/**
 * Build sorted skill entries from current and target matrices
 * @param {Array} currentMatrix
 * @param {Array} targetMatrix
 * @param {Object} options
 * @returns {{currentData: Array, targetData: Array}}
 */
function buildSkillComparisonData(currentMatrix, targetMatrix, options) {
  const allSkillIds = new Set([
    ...currentMatrix.map((s) => s.skillId),
    ...targetMatrix.map((s) => s.skillId),
  ]);

  const skillEntries = [];
  for (const skillId of allSkillIds) {
    const currentSkill = currentMatrix.find((s) => s.skillId === skillId);
    const targetSkill = targetMatrix.find((s) => s.skillId === skillId);
    skillEntries.push({
      skillId,
      skillName: currentSkill?.skillName || targetSkill?.skillName,
      capability: currentSkill?.capability || targetSkill?.capability || "",
      currentSkill,
      targetSkill,
    });
  }

  const capabilityComparator = options.capabilities
    ? compareByCapability(options.capabilities)
    : (a, b) => a.capability.localeCompare(b.capability);
  skillEntries.sort((a, b) => {
    const capDiff = capabilityComparator(a, b);
    return capDiff !== 0 ? capDiff : a.skillName.localeCompare(b.skillName);
  });

  const currentData = [];
  const targetData = [];

  for (const { skillName, currentSkill, targetSkill } of skillEntries) {
    currentData.push({
      label: skillName,
      value: currentSkill ? getSkillProficiencyIndex(currentSkill.level) : 0,
      maxValue: 5,
      description: currentSkill
        ? `${formatLevel(currentSkill.type)} - ${formatLevel(currentSkill.level)}`
        : "Not required",
    });
    targetData.push({
      label: skillName,
      value: targetSkill ? getSkillProficiencyIndex(targetSkill.level) : 0,
      maxValue: 5,
      description: targetSkill
        ? `${formatLevel(targetSkill.type)} - ${formatLevel(targetSkill.level)}`
        : "Not required",
    });
  }

  return { currentData, targetData };
}

/**
 * Build behaviour comparison data from current and target profiles
 * @param {Array} currentProfile
 * @param {Array} targetProfile
 * @returns {{currentData: Array, targetData: Array}}
 */
function buildBehaviourComparisonData(currentProfile, targetProfile) {
  const allBehaviourIds = new Set([
    ...currentProfile.map((b) => b.behaviourId),
    ...targetProfile.map((b) => b.behaviourId),
  ]);

  const currentData = [];
  const targetData = [];

  for (const behaviourId of allBehaviourIds) {
    const currentBehaviour = currentProfile.find(
      (b) => b.behaviourId === behaviourId,
    );
    const targetBehaviour = targetProfile.find(
      (b) => b.behaviourId === behaviourId,
    );
    const behaviourName =
      currentBehaviour?.behaviourName || targetBehaviour?.behaviourName;

    currentData.push({
      label: behaviourName,
      value: currentBehaviour
        ? getBehaviourMaturityIndex(currentBehaviour.maturity)
        : 0,
      maxValue: 5,
      description: currentBehaviour
        ? `${formatLevel(currentBehaviour.maturity)}`
        : "Not required",
    });
    targetData.push({
      label: behaviourName,
      value: targetBehaviour
        ? getBehaviourMaturityIndex(targetBehaviour.maturity)
        : 0,
      maxValue: 5,
      description: targetBehaviour
        ? `${formatLevel(targetBehaviour.maturity)}`
        : "Not required",
    });
  }

  return { currentData, targetData };
}

/**
 * Create a comparison skill radar chart
 * @param {SkillMatrixItem[]} currentMatrix - Current skill matrix entries
 * @param {SkillMatrixItem[]} targetMatrix - Target skill matrix entries
 * @param {Object} [options]
 * @returns {HTMLElement}
 */
export function createComparisonSkillRadar(
  currentMatrix,
  targetMatrix = [],
  options = {},
) {
  const container = div(
    { className: "radar-container comparison-radar" },
    h3({ className: "radar-title" }, options.title || "Skills Comparison"),
    div(
      { className: "radar-legend" },
      div(
        { className: "legend-item" },
        div({ className: "legend-color", style: "background: #3b82f6" }),
        options.currentLabel || "Current",
      ),
      div(
        { className: "legend-item" },
        div({ className: "legend-color", style: "background: #10b981" }),
        options.targetLabel || "Target",
      ),
    ),
    div({
      className: "radar-chart-wrapper",
      id: `skill-comparison-${Date.now()}`,
    }),
  );

  // Render chart after container is in DOM
  setTimeout(() => {
    const wrapper = container.querySelector(".radar-chart-wrapper");
    if (!wrapper || !currentMatrix || currentMatrix.length === 0) return;

    const { currentData, targetData } = buildSkillComparisonData(
      currentMatrix,
      targetMatrix,
      options,
    );

    const chart = new ComparisonRadarChart({
      container: wrapper,
      currentData,
      targetData,
      options: {
        levels: 5,
        currentColor: options.currentColor || "#3b82f6",
        targetColor: options.targetColor || "#10b981",
        size: options.size || 400,
        showLabels: true,
        showTooltips: true,
      },
    });

    chart.render();
  }, 0);

  return container;
}

/**
 * Create a comparison behaviour radar chart
 * @param {BehaviourProfileItem[]} currentProfile - Current behaviour profile entries
 * @param {BehaviourProfileItem[]} targetProfile - Target behaviour profile entries
 * @param {Object} [options]
 * @returns {HTMLElement}
 */
export function createComparisonBehaviourRadar(
  currentProfile,
  targetProfile = [],
  options = {},
) {
  const container = div(
    { className: "radar-container comparison-radar" },
    h3({ className: "radar-title" }, options.title || "Behaviours Comparison"),
    div(
      { className: "radar-legend" },
      div(
        { className: "legend-item" },
        div({ className: "legend-color", style: "background: #3b82f6" }),
        options.currentLabel || "Current",
      ),
      div(
        { className: "legend-item" },
        div({ className: "legend-color", style: "background: #10b981" }),
        options.targetLabel || "Target",
      ),
    ),
    div({
      className: "radar-chart-wrapper",
      id: `behaviour-comparison-${Date.now()}`,
    }),
  );

  // Render chart after container is in DOM
  setTimeout(() => {
    const wrapper = container.querySelector(".radar-chart-wrapper");
    if (!wrapper || !currentProfile || currentProfile.length === 0) return;

    const { currentData, targetData } = buildBehaviourComparisonData(
      currentProfile,
      targetProfile,
    );

    const chart = new ComparisonRadarChart({
      container: wrapper,
      currentData,
      targetData,
      options: {
        levels: 5,
        currentColor: options.currentColor || "#3b82f6",
        targetColor: options.targetColor || "#10b981",
        size: options.size || 400,
        showLabels: true,
        showTooltips: true,
      },
    });

    chart.render();
  }, 0);

  return container;
}

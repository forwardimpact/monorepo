/**
 * Comparison radar chart component
 * Displays two overlaid radar charts for comparing current vs target levels
 */

/** @typedef {import('../types.js').SkillMatrixItem} SkillMatrixItem */
/** @typedef {import('../types.js').BehaviourProfileItem} BehaviourProfileItem */

import { ComparisonRadarChart } from "../lib/radar.js";
import { div, h3 } from "../lib/render.js";
import {
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
  formatLevel,
} from "../lib/render.js";
import { compareByCapability } from "@forwardimpact/libpathway/policies";

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

    // Build aligned data arrays that include all skills from both matrices
    // This handles new skills (in target but not current) and removed skills (in current but not target)
    const allSkillIds = new Set([
      ...currentMatrix.map((s) => s.skillId),
      ...targetMatrix.map((s) => s.skillId),
    ]);

    // Build skill entries with capability info for sorting
    const skillEntries = [];
    for (const skillId of allSkillIds) {
      const currentSkill = currentMatrix.find((s) => s.skillId === skillId);
      const targetSkill = targetMatrix.find((s) => s.skillId === skillId);
      const capability =
        currentSkill?.capability || targetSkill?.capability || "";
      const skillName = currentSkill?.skillName || targetSkill?.skillName;

      skillEntries.push({
        skillId,
        skillName,
        capability,
        currentSkill,
        targetSkill,
      });
    }

    // Sort by capability order, then by skill name within capability
    const capabilityComparator = options.capabilities
      ? compareByCapability(options.capabilities)
      : (a, b) => a.capability.localeCompare(b.capability);
    skillEntries.sort((a, b) => {
      const capDiff = capabilityComparator(a, b);
      if (capDiff !== 0) return capDiff;
      return a.skillName.localeCompare(b.skillName);
    });

    const currentData = [];
    const targetData = [];

    for (const entry of skillEntries) {
      const { skillName, currentSkill, targetSkill } = entry;

      currentData.push({
        label: skillName,
        value: currentSkill ? getSkillLevelIndex(currentSkill.level) : 0,
        maxValue: 5,
        description: currentSkill
          ? `${formatLevel(currentSkill.type)} - ${formatLevel(currentSkill.level)}`
          : "Not required",
      });

      targetData.push({
        label: skillName,
        value: targetSkill ? getSkillLevelIndex(targetSkill.level) : 0,
        maxValue: 5,
        description: targetSkill
          ? `${formatLevel(targetSkill.type)} - ${formatLevel(targetSkill.level)}`
          : "Not required",
      });
    }

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

    // Build aligned data arrays that include all behaviours from both profiles
    // This handles new behaviours (in target but not current) and removed behaviours (in current but not target)
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

      // Use whichever behaviour entry exists for the label
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

/**
 * Career progress detail page
 * Compares skill and behaviour progression across discipline × level × track
 */

import { render, div, h1, h2, p, a, label, section } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBackLink } from "../components/nav.js";
import { createStatCard } from "../components/card.js";
import { renderError } from "../components/error-page.js";
import {
  createSelectWithValue,
  createDisciplineSelect,
} from "../lib/form-controls.js";
import {
  prepareCurrentJob,
  prepareCustomProgression,
  getDefaultTargetLevel,
} from "../formatters/progress/shared.js";
import { isValidJobCombination } from "@forwardimpact/libskill/derivation";
import { buildComparisonResult } from "./progress-comparison.js";

/**
 * Render career progress detail page
 * @param {Object} params - Route params
 */
export function renderProgressDetail(params) {
  const { discipline: disciplineId, level: levelId, track: trackId } = params;
  const { data } = getState();

  // Find the components
  const discipline = data.disciplines.find((d) => d.id === disciplineId);
  const level = data.levels.find((g) => g.id === levelId);
  const track = trackId ? data.tracks.find((t) => t.id === trackId) : null;

  if (!discipline || !level) {
    renderError({
      title: "Role Not Found",
      message: "Invalid role combination. Discipline or level not found.",
      backPath: "/career-progress",
      backText: "← Back to Career Progress",
    });
    return;
  }

  // Show an error if trackId exists but no track matches it
  if (trackId && !track) {
    renderError({
      title: "Role Not Found",
      message: `Track "${trackId}" not found.`,
      backPath: "/career-progress",
      backText: "← Back to Career Progress",
    });
    return;
  }

  // Prepare current job view
  const currentJobView = prepareCurrentJob({
    discipline,
    level,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
  });

  if (!currentJobView) {
    renderError({
      title: "Invalid Combination",
      message: "This discipline, track, and level combination is not valid.",
      backPath: "/career-progress",
      backText: "← Back to Career Progress",
    });
    return;
  }

  // Find next level for default comparison
  const nextLevel = getDefaultTargetLevel(level, data.levels);

  const page = div(
    { className: "progress-detail-page" },
    // Header
    div(
      { className: "page-header" },
      createBackLink("/career-progress", "← Back to Career Progress"),
      h1({ className: "page-title" }, "Career Progress"),
      div(
        { className: "page-description" },
        "Current role: ",
        a({ href: `#/discipline/${discipline.id}` }, discipline.specialization),
        " × ",
        a({ href: `#/level/${level.id}` }, level.id),
        track
          ? [" × ", a({ href: `#/track/${track.id}` }, track.name)]
          : " (Generalist)",
      ),
    ),

    // Current role summary
    section(
      { className: "section section-detail" },
      h2({ className: "section-title" }, `📍 Current: ${currentJobView.title}`),
      div(
        { className: "grid grid-3" },
        createStatCard({
          value: currentJobView.skillCount,
          label: "Skills",
        }),
        createStatCard({
          value: currentJobView.behaviourCount,
          label: "Behaviours",
        }),
        createStatCard({
          value: currentJobView.coreSkillCount,
          label: "Core Skills",
        }),
      ),
    ),

    // Comparison selectors section
    createComparisonSelectorsSection({
      discipline,
      currentLevel: level,
      currentTrack: track,
      currentJobView,
      nextLevel,
      data,
    }),

    // Actions
    div(
      { className: "page-actions", style: "margin-top: 2rem" },
      a(
        {
          href: trackId
            ? `#/job/${disciplineId}/${levelId}/${trackId}`
            : `#/job/${disciplineId}/${levelId}`,
          className: "btn btn-secondary",
        },
        "View Full Job Definition",
      ),
    ),
  );

  render(page);
}

/**
 * Create the comparison selectors section
 * Defaults to same discipline, same track, next level up
 * @param {Object} params
 * @param {Object} params.discipline - Current discipline
 * @param {Object} params.currentLevel - Current level
 * @param {Object} params.currentTrack - Current track
 * @param {Object} params.currentJobView - Current job view from presenter
 * @param {Object|null} params.nextLevel - Next level (for default selection)
 * @param {Object} params.data - Full data object with disciplines, levels, tracks, skills, behaviours
 * @returns {HTMLElement}
 */
function createComparisonSelectorsSection({
  discipline,
  currentLevel,
  currentTrack,
  currentJobView,
  nextLevel,
  data,
}) {
  // Create a container for dynamic comparison results
  const comparisonResultsContainer = div({
    className: "comparison-results",
    id: "comparison-results",
  });

  // State to track current selections. Defaults are the same discipline,
  // the same track, and the next level.
  let selectedDisciplineId = discipline.id;
  let selectedLevelId = nextLevel?.id || "";
  let selectedTrackId = currentTrack?.id || "";

  /**
   * Collect valid levels and tracks for a single level row
   * @param {Object} selectedDisc
   * @param {Object} level
   * @param {Array} validLevels
   * @param {Set} validTracks
   * @returns {boolean} - Whether the discipline allows trackless at this level
   */
  function collectLevelCombinations(
    selectedDisc,
    level,
    validLevels,
    validTracks,
  ) {
    let allowsTrackless = false;

    if (
      isValidJobCombination({ discipline: selectedDisc, level, track: null })
    ) {
      if (!validLevels.find((g) => g.id === level.id)) {
        validLevels.push(level);
      }
      allowsTrackless = true;
    }

    for (const track of data.tracks) {
      if (isValidJobCombination({ discipline: selectedDisc, level, track })) {
        if (!validLevels.find((g) => g.id === level.id)) {
          validLevels.push(level);
        }
        validTracks.add(track.id);
      }
    }

    return allowsTrackless;
  }

  // Get available options based on selected discipline
  function getAvailableOptions(disciplineId) {
    const selectedDisc = data.disciplines.find((d) => d.id === disciplineId);
    if (!selectedDisc)
      return { levels: [], tracks: [], allowsTrackless: false };

    const validLevels = [];
    const validTracks = new Set();
    let allowsTrackless = false;

    for (const level of data.levels) {
      if (
        collectLevelCombinations(selectedDisc, level, validLevels, validTracks)
      ) {
        allowsTrackless = true;
      }
    }

    return {
      levels: validLevels.sort((a, b) => a.level - b.level),
      tracks: data.tracks
        .filter((t) => validTracks.has(t.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
      allowsTrackless,
    };
  }

  /**
   * Update the comparison results based on current selections
   */
  function updateComparison() {
    comparisonResultsContainer.innerHTML = "";

    if (!selectedDisciplineId || !selectedLevelId) {
      comparisonResultsContainer.appendChild(
        div(
          { className: "comparison-placeholder" },
          p(
            { className: "text-muted" },
            "Select a discipline and level to see the comparison.",
          ),
        ),
      );
      return;
    }

    const targetDiscipline = data.disciplines.find(
      (d) => d.id === selectedDisciplineId,
    );
    const targetLevel = data.levels.find((g) => g.id === selectedLevelId);
    const targetTrack = selectedTrackId
      ? data.tracks.find((t) => t.id === selectedTrackId)
      : null;

    if (!targetDiscipline || !targetLevel) return;

    if (
      targetDiscipline.id === discipline.id &&
      targetLevel.id === currentLevel.id &&
      targetTrack?.id === currentTrack?.id
    ) {
      comparisonResultsContainer.appendChild(
        div(
          { className: "comparison-placeholder" },
          p(
            { className: "text-muted" },
            "Select a different role to compare with your current role.",
          ),
        ),
      );
      return;
    }

    const progressionView = prepareCustomProgression({
      discipline,
      currentLevel,
      currentTrack,
      targetDiscipline,
      targetLevel,
      targetTrack,
      skills: data.skills,
      behaviours: data.behaviours,
    });

    if (!progressionView) {
      comparisonResultsContainer.appendChild(
        div(
          { className: "comparison-error" },
          p({ className: "text-muted" }, "This combination is not valid."),
        ),
      );
      return;
    }

    comparisonResultsContainer.appendChild(
      buildComparisonResult(
        progressionView,
        currentJobView,
        currentLevel,
        targetLevel,
        targetTrack,
        targetDiscipline,
        data,
      ),
    );
  }

  // Get initial available options
  let availableOptions = getAvailableOptions(selectedDisciplineId);

  // Keep references to the select elements to update them later
  let levelSelectEl = null;
  let trackSelectEl = null;

  /**
   * Rebuild the level select options. Keep the selection if it is still valid.
   */
  function rebuildLevelOptions() {
    if (!levelSelectEl) return;

    levelSelectEl.innerHTML = "";
    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = "Select level...";
    levelSelectEl.appendChild(placeholderOpt);

    for (const level of availableOptions.levels) {
      const opt = document.createElement("option");
      opt.value = level.id;
      opt.textContent = level.id;
      levelSelectEl.appendChild(opt);
    }

    if (availableOptions.levels.find((g) => g.id === selectedLevelId)) {
      levelSelectEl.value = selectedLevelId;
    } else {
      selectedLevelId = "";
      levelSelectEl.value = "";
    }
  }

  /**
   * Rebuild the track select options. Keep the selection if it is still valid.
   */
  function rebuildTrackOptions() {
    if (!trackSelectEl) return;

    trackSelectEl.innerHTML = "";

    if (availableOptions.allowsTrackless) {
      const generalistOpt = document.createElement("option");
      generalistOpt.value = "";
      generalistOpt.textContent = "Generalist";
      trackSelectEl.appendChild(generalistOpt);
    } else {
      const placeholderOpt = document.createElement("option");
      placeholderOpt.value = "";
      placeholderOpt.textContent = "Select track...";
      placeholderOpt.disabled = true;
      trackSelectEl.appendChild(placeholderOpt);
    }

    for (const track of availableOptions.tracks) {
      const opt = document.createElement("option");
      opt.value = track.id;
      opt.textContent = track.name;
      trackSelectEl.appendChild(opt);
    }

    const hasValidTrack = availableOptions.tracks.find(
      (t) => t.id === selectedTrackId,
    );
    const isValidGeneralist =
      selectedTrackId === "" && availableOptions.allowsTrackless;
    if (hasValidTrack || isValidGeneralist) {
      trackSelectEl.value = selectedTrackId;
    } else {
      selectedTrackId = "";
      trackSelectEl.value = "";
    }
  }

  /**
   * Update level and track selectors when discipline changes
   */
  function updateSelectorsForDiscipline(newDisciplineId) {
    availableOptions = getAvailableOptions(newDisciplineId);
    rebuildLevelOptions();
    rebuildTrackOptions();
  }

  // Create level and track selects with stored references
  levelSelectEl = createSelectWithValue({
    id: "compare-level-select",
    items: availableOptions.levels,
    initialValue: selectedLevelId,
    placeholder: "Select level...",
    getDisplayName: (g) => g.id,
    onChange: (value) => {
      selectedLevelId = value;
      updateComparison();
    },
  });

  trackSelectEl = createSelectWithValue({
    id: "compare-track-select",
    items: availableOptions.tracks,
    initialValue: selectedTrackId,
    placeholder: "Select track...",
    getDisplayName: (t) => t.name,
    onChange: (value) => {
      selectedTrackId = value;
      updateComparison();
    },
  });

  // Trigger initial comparison if we have defaults
  if (selectedLevelId && selectedTrackId) {
    // Use setTimeout to make sure the DOM is ready
    setTimeout(() => updateComparison(), 0);
  }

  // Create the section with selectors
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "📈 Compare Progression"),
    p(
      { className: "text-muted", style: "margin-bottom: 1rem" },
      "Compare your current role with another discipline, level, or track combination.",
    ),

    // Selector row
    div(
      { className: "comparison-selectors" },
      div(
        { className: "form-group" },
        label({ for: "compare-discipline-select" }, "Target Discipline"),
        createDisciplineSelect({
          id: "compare-discipline-select",
          disciplines: data.disciplines,
          initialValue: selectedDisciplineId,
          placeholder: "Select discipline...",
          getDisplayName: (d) => d.specialization,
          onChange: (value) => {
            selectedDisciplineId = value;
            updateSelectorsForDiscipline(value);
            updateComparison();
          },
        }),
      ),
      div(
        { className: "form-group" },
        label({ for: "compare-level-select" }, "Target Level"),
        levelSelectEl,
      ),
      div(
        { className: "form-group" },
        label({ for: "compare-track-select" }, "Target Track"),
        trackSelectEl,
      ),
    ),

    // Placeholder for results
    comparisonResultsContainer,
  );
}

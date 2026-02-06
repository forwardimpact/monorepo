/**
 * Career progress detail page
 * Shows skill and behaviour progression comparison across discipline × grade × track
 */

import { render, div, h1, h2, p, a, label, section } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBackLink } from "../components/nav.js";
import { createStatCard } from "../components/card.js";
import {
  createComparisonSkillRadar,
  createComparisonBehaviourRadar,
} from "../components/comparison-radar.js";
import { createProgressionTable } from "../components/progression-table.js";
import { renderError } from "../components/error-page.js";
import {
  createSelectWithValue,
  createDisciplineSelect,
} from "../lib/form-controls.js";
import {
  prepareCurrentJob,
  prepareCustomProgression,
  getDefaultTargetGrade,
  isValidCombination,
} from "../formatters/progress/shared.js";

/**
 * Render career progress detail page
 * @param {Object} params - Route params
 */
export function renderProgressDetail(params) {
  const { discipline: disciplineId, grade: gradeId, track: trackId } = params;
  const { data } = getState();

  // Find the components
  const discipline = data.disciplines.find((d) => d.id === disciplineId);
  const grade = data.grades.find((g) => g.id === gradeId);
  const track = trackId ? data.tracks.find((t) => t.id === trackId) : null;

  if (!discipline || !grade) {
    renderError({
      title: "Role Not Found",
      message: "Invalid role combination. Discipline or grade not found.",
      backPath: "/career-progress",
      backText: "← Back to Career Progress",
    });
    return;
  }

  // If trackId was provided but not found, error
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
    grade,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
  });

  if (!currentJobView) {
    renderError({
      title: "Invalid Combination",
      message: "This discipline, track, and grade combination is not valid.",
      backPath: "/career-progress",
      backText: "← Back to Career Progress",
    });
    return;
  }

  // Find next grade for default comparison
  const nextGrade = getDefaultTargetGrade(grade, data.grades);

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
        a({ href: `#/grade/${grade.id}` }, grade.id),
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
          value: currentJobView.primarySkillCount,
          label: "Primary Skills",
        }),
      ),
    ),

    // Comparison selectors section
    createComparisonSelectorsSection({
      discipline,
      currentGrade: grade,
      currentTrack: track,
      currentJobView,
      nextGrade,
      data,
    }),

    // Actions
    div(
      { className: "page-actions", style: "margin-top: 2rem" },
      a(
        {
          href: trackId
            ? `#/job/${disciplineId}/${gradeId}/${trackId}`
            : `#/job/${disciplineId}/${gradeId}`,
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
 * Defaults to same discipline, same track, next grade up
 * @param {Object} params
 * @param {Object} params.discipline - Current discipline
 * @param {Object} params.currentGrade - Current grade
 * @param {Object} params.currentTrack - Current track
 * @param {Object} params.currentJobView - Current job view from presenter
 * @param {Object|null} params.nextGrade - Next grade (for default selection)
 * @param {Object} params.data - Full data object with disciplines, grades, tracks, skills, behaviours
 * @returns {HTMLElement}
 */
function createComparisonSelectorsSection({
  discipline,
  currentGrade,
  currentTrack,
  currentJobView,
  nextGrade,
  data,
}) {
  // Create a container for dynamic comparison results
  const comparisonResultsContainer = div({
    className: "comparison-results",
    id: "comparison-results",
  });

  // State to track current selections - default to same discipline, same track, next grade
  let selectedDisciplineId = discipline.id;
  let selectedGradeId = nextGrade?.id || "";
  let selectedTrackId = currentTrack?.id || "";

  // Get available options based on selected discipline
  function getAvailableOptions(disciplineId) {
    const selectedDisc = data.disciplines.find((d) => d.id === disciplineId);
    if (!selectedDisc)
      return { grades: [], tracks: [], allowsTrackless: false };

    const validGrades = [];
    const validTracks = new Set();
    let allowsTrackless = false;

    for (const grade of data.grades) {
      // Check trackless combination
      if (
        isValidCombination({ discipline: selectedDisc, grade, track: null })
      ) {
        if (!validGrades.find((g) => g.id === grade.id)) {
          validGrades.push(grade);
        }
        allowsTrackless = true;
      }
      // Check each track combination
      for (const track of data.tracks) {
        if (isValidCombination({ discipline: selectedDisc, grade, track })) {
          if (!validGrades.find((g) => g.id === grade.id)) {
            validGrades.push(grade);
          }
          validTracks.add(track.id);
        }
      }
    }

    return {
      grades: validGrades.sort((a, b) => a.level - b.level),
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
    // Clear previous results
    comparisonResultsContainer.innerHTML = "";

    // Track can be empty string for generalist, but discipline and grade are required
    if (!selectedDisciplineId || !selectedGradeId) {
      comparisonResultsContainer.appendChild(
        div(
          { className: "comparison-placeholder" },
          p(
            { className: "text-muted" },
            "Select a discipline and grade to see the comparison.",
          ),
        ),
      );
      return;
    }

    const targetDiscipline = data.disciplines.find(
      (d) => d.id === selectedDisciplineId,
    );
    const targetGrade = data.grades.find((g) => g.id === selectedGradeId);
    // selectedTrackId can be empty string for generalist
    const targetTrack = selectedTrackId
      ? data.tracks.find((t) => t.id === selectedTrackId)
      : null;

    if (!targetDiscipline || !targetGrade) {
      return;
    }

    // Check if comparing to same role
    if (
      targetDiscipline.id === discipline.id &&
      targetGrade.id === currentGrade.id &&
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

    // Use formatter shared module to analyze the progression
    const progressionView = prepareCustomProgression({
      discipline,
      currentGrade,
      currentTrack,
      targetDiscipline,
      targetGrade,
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

    const { skillChanges, behaviourChanges, summary, target } = progressionView;

    // Build flat comparison result sections
    const result = div(
      { className: "comparison-result" },

      // Summary stats
      div(
        { className: "grid grid-6" },
        summary.skillsGained > 0
          ? createStatCard({ value: summary.skillsGained, label: "New Skills" })
          : null,
        createStatCard({
          value: summary.skillsUp,
          label: "Skills to Grow",
        }),
        summary.skillsDown > 0
          ? createStatCard({
              value: summary.skillsDown,
              label: "Skills Decrease",
            })
          : null,
        summary.skillsLost > 0
          ? createStatCard({
              value: summary.skillsLost,
              label: "Skills Removed",
            })
          : null,
        createStatCard({
          value: summary.behavioursUp,
          label: "Behaviours to Mature",
        }),
        summary.behavioursDown > 0
          ? createStatCard({
              value: summary.behavioursDown,
              label: "Behaviours Decrease",
            })
          : null,
      ),

      // Comparison radars
      div(
        { className: "section auto-grid-lg" },
        createComparisonSkillRadar(
          currentJobView.skillMatrix,
          target.skillMatrix,
          {
            title: "Skills Comparison",
            currentLabel: `Current (${currentGrade.id})`,
            targetLabel: `Target (${targetGrade.id})`,
            size: 400,
            capabilities: data.capabilities,
          },
        ),
        createComparisonBehaviourRadar(
          currentJobView.behaviourProfile,
          target.behaviourProfile,
          {
            title: "Behaviours Comparison",
            currentLabel: `Current (${currentGrade.id})`,
            targetLabel: `Target (${targetGrade.id})`,
            size: 400,
          },
        ),
      ),

      // Skill changes section
      section(
        { className: "section section-detail" },
        h2({ className: "section-title" }, "Skill Changes"),
        createProgressionTable(skillChanges, "skill"),
      ),

      // Behaviour changes section
      section(
        { className: "section section-detail" },
        h2({ className: "section-title" }, "Behaviour Changes"),
        createProgressionTable(behaviourChanges, "behaviour"),
      ),

      // Link to target job
      div(
        { className: "page-actions" },
        a(
          {
            href: targetTrack
              ? `#/job/${targetDiscipline.id}/${targetGrade.id}/${targetTrack.id}`
              : `#/job/${targetDiscipline.id}/${targetGrade.id}`,
            className: "btn btn-secondary",
          },
          `View ${targetGrade.id}${targetTrack ? ` ${targetTrack.name}` : ""} Job Definition →`,
        ),
      ),
    );

    comparisonResultsContainer.appendChild(result);
  }

  // Get initial available options
  let availableOptions = getAvailableOptions(selectedDisciplineId);

  // References to select elements for updating
  let gradeSelectEl = null;
  let trackSelectEl = null;

  /**
   * Update grade and track selectors when discipline changes
   */
  function updateSelectorsForDiscipline(newDisciplineId) {
    availableOptions = getAvailableOptions(newDisciplineId);

    // Update grade selector
    if (gradeSelectEl) {
      gradeSelectEl.innerHTML = "";
      const placeholderOpt = document.createElement("option");
      placeholderOpt.value = "";
      placeholderOpt.textContent = "Select grade...";
      gradeSelectEl.appendChild(placeholderOpt);

      for (const grade of availableOptions.grades) {
        const opt = document.createElement("option");
        opt.value = grade.id;
        opt.textContent = grade.id;
        gradeSelectEl.appendChild(opt);
      }

      // Try to keep current selection if valid
      if (availableOptions.grades.find((g) => g.id === selectedGradeId)) {
        gradeSelectEl.value = selectedGradeId;
      } else {
        selectedGradeId = "";
        gradeSelectEl.value = "";
      }
    }

    // Update track selector
    if (trackSelectEl) {
      trackSelectEl.innerHTML = "";

      // Add generalist option if discipline allows trackless
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

      // Try to keep current selection if valid
      const hasValidTrack = availableOptions.tracks.find(
        (t) => t.id === selectedTrackId,
      );
      const isValidGeneralist =
        selectedTrackId === "" && availableOptions.allowsTrackless;
      if (hasValidTrack || isValidGeneralist) {
        trackSelectEl.value = selectedTrackId;
      } else if (availableOptions.allowsTrackless) {
        selectedTrackId = "";
        trackSelectEl.value = "";
      } else {
        selectedTrackId = "";
        trackSelectEl.value = "";
      }
    }
  }

  // Create grade and track selects with stored references
  gradeSelectEl = createSelectWithValue({
    id: "compare-grade-select",
    items: availableOptions.grades,
    initialValue: selectedGradeId,
    placeholder: "Select grade...",
    getDisplayName: (g) => g.id,
    onChange: (value) => {
      selectedGradeId = value;
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
  if (selectedGradeId && selectedTrackId) {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => updateComparison(), 0);
  }

  // Create the section with selectors
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "📈 Compare Progression"),
    p(
      { className: "text-muted", style: "margin-bottom: 1rem" },
      "Compare your current role with another discipline, grade, or track combination.",
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
        label({ for: "compare-grade-select" }, "Target Grade"),
        gradeSelectEl,
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

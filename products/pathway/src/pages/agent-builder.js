/**
 * Agent builder page
 *
 * Single scrollable view for generating AI coding agent configurations.
 * Uses dropdown pattern matching job builder: discipline × track × stage.
 * Stage includes "All Stages" option for complete deployment downloads.
 */

import {
  render,
  div,
  h1,
  h2,
  p,
  label,
  select,
  option,
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { loadAgentDataBrowser } from "../lib/yaml-loader.js";
import { deriveReferenceLevel } from "@forwardimpact/libskill";
import {
  createSelectWithValue,
  createDisciplineSelect,
} from "../lib/form-controls.js";
import { createReactive } from "../lib/reactive.js";
import { getStageEmoji } from "../formatters/stage/shared.js";
import {
  createAllStagesPreview,
  createSingleStagePreview,
  createHelpSection,
} from "./agent-builder-preview.js";
import { createInstallSection } from "./agent-builder-install.js";

/** All stages option value */
const ALL_STAGES_VALUE = "all";

/** @type {Object|null} Cached agent data */
let agentDataCache = null;

/** @type {{agent: string, skill: string}|null} Cached templates */
let templateCache = null;

/**
 * Load agent data with caching
 * @param {string} dataDir - Data directory path
 * @returns {Promise<Object>}
 */
async function getAgentData(dataDir = "./data") {
  if (!agentDataCache) {
    agentDataCache = await loadAgentDataBrowser(dataDir);
  }
  return agentDataCache;
}

/**
 * Load templates with caching
 * @returns {Promise<{agent: string, skill: string, install: string, reference: string}>}
 */
async function getTemplates() {
  if (!templateCache) {
    const [agentRes, skillRes, installRes, referenceRes] = await Promise.all([
      fetch("./templates/agent.template.md"),
      fetch("./templates/skill.template.md"),
      fetch("./templates/skill-install.template.sh"),
      fetch("./templates/skill-reference.template.md"),
    ]);
    templateCache = {
      agent: await agentRes.text(),
      skill: await skillRes.text(),
      install: await installRes.text(),
      reference: await referenceRes.text(),
    };
  }
  return templateCache;
}

/**
 * Render agent builder page
 */
export async function renderAgentBuilder() {
  const { data } = getState();
  const siteUrl = data.framework?.distribution?.siteUrl;

  // Show loading state
  render(
    div(
      { className: "agent-builder-page wide" },
      div({ className: "loading" }, p({}, "Loading agent definitions...")),
    ),
  );

  // Load agent-specific data and templates
  const [agentData, templates] = await Promise.all([
    getAgentData(),
    getTemplates(),
  ]);

  // Filter to only disciplines/tracks that have agent definitions
  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  const availableDisciplines = data.disciplines.filter((d) =>
    agentDisciplineIds.has(d.id),
  );
  // All tracks with agent definitions (will be filtered per-discipline)
  const allAgentTracks = data.tracks.filter((t) => agentTrackIds.has(t.id));
  const stages = data.stages || [];

  /**
   * Get tracks valid for a discipline that also have agent definitions
   * @param {string} disciplineId - Discipline ID
   * @returns {Array} - Valid tracks for the discipline
   */
  function getValidTracksForDiscipline(disciplineId) {
    const discipline = data.disciplines.find((d) => d.id === disciplineId);
    if (!discipline) return [];

    const validTracks = discipline.validTracks ?? [];
    // Filter to track IDs only (exclude null which means trackless)
    const validTrackIds = validTracks.filter((t) => t !== null);

    // Intersection: valid for discipline AND has agent definition
    return allAgentTracks.filter((t) => validTrackIds.includes(t.id));
  }

  // Track select element - created once, options updated when discipline changes
  const trackSelectEl = select(
    { className: "form-select", id: "agent-track-select" },
    option({ value: "", disabled: true, selected: true }, "Select a track..."),
  );
  trackSelectEl.disabled = true;

  /**
   * Update track select options based on selected discipline
   * @param {string} disciplineId - Discipline ID
   */
  function updateTrackOptions(disciplineId) {
    const validTracks = getValidTracksForDiscipline(disciplineId);

    // Clear existing options
    trackSelectEl.innerHTML = "";

    if (validTracks.length === 0) {
      trackSelectEl.appendChild(
        option(
          { value: "", disabled: true, selected: true },
          "No tracks available for this discipline",
        ),
      );
      trackSelectEl.disabled = true;
      return;
    }

    // Add placeholder
    trackSelectEl.appendChild(
      option(
        { value: "", disabled: true, selected: true },
        "Select a track...",
      ),
    );

    // Add available track options
    validTracks.forEach((t) => {
      trackSelectEl.appendChild(option({ value: t.id }, t.name));
    });

    trackSelectEl.disabled = false;
  }

  // Build stage options with "All Stages" first
  const stageOptions = [
    { id: ALL_STAGES_VALUE, name: "All Stages" },
    ...stages.map((s) => ({
      id: s.id,
      name: `${getStageEmoji(stages, s.id)} ${s.name}`,
    })),
  ];

  // Parse URL params for pre-selection
  // Supports: /agent/discipline, /agent/discipline/track, /agent/discipline/track/stage
  const hash = window.location.hash;
  const pathMatch = hash.match(
    // eslint-disable-next-line security/detect-unsafe-regex -- negated char classes prevent backtracking; parses internal URL hash
    /#\/agent\/([^/]+)(?:\/([^/]+))?(?:\/([^/?]+))?/,
  );
  const initialDiscipline = pathMatch ? pathMatch[1] : "";
  const initialTrack = pathMatch && pathMatch[2] ? pathMatch[2] : "";
  const initialStage =
    pathMatch && pathMatch[3] ? pathMatch[3] : ALL_STAGES_VALUE;

  // Create reactive selection state
  const selection = createReactive({
    discipline: initialDiscipline,
    track: initialTrack,
    stage: initialStage,
  });

  // Preview container - will be updated reactively
  const previewContainer = div(
    { className: "agent-preview" },
    createEmptyState(availableDisciplines.length, allAgentTracks.length),
  );

  /**
   * Update the preview when selection changes
   * @param {Object} sel - Current selection
   */
  function updatePreview({ discipline, track, stage }) {
    // Update URL without triggering navigation
    if (discipline) {
      const trackPart = track ? `/${track}` : "";
      const stagePart = stage && stage !== ALL_STAGES_VALUE ? `/${stage}` : "";
      const newHash = `#/agent/${discipline}${trackPart}${stagePart}`;
      if (window.location.hash !== newHash) {
        history.replaceState(null, "", newHash);
      }
    }

    previewContainer.innerHTML = "";

    if (!discipline) {
      previewContainer.appendChild(
        createEmptyState(availableDisciplines.length, allAgentTracks.length),
      );
      return;
    }

    // Get full objects
    const humanDiscipline = data.disciplines.find((d) => d.id === discipline);
    const humanTrack = track ? data.tracks.find((t) => t.id === track) : null;
    const agentDiscipline = agentData.disciplines.find(
      (d) => d.id === discipline,
    );
    const agentTrack = agentData.tracks.find((t) => t.id === track);

    if (!humanDiscipline || !humanTrack || !agentDiscipline || !agentTrack) {
      previewContainer.appendChild(
        div(
          { className: "empty-state" },
          p({ className: "text-muted" }, "Invalid combination selected."),
        ),
      );
      return;
    }

    // Get reference level for derivation
    const level = deriveReferenceLevel(data.levels);

    // Build context for generation
    const context = {
      humanDiscipline,
      humanTrack,
      agentDiscipline,
      agentTrack,
      level,
      stages,
      skills: data.skills,
      behaviours: data.behaviours,
      agentBehaviours: agentData.behaviours,
      claudeCodeSettings: agentData.claudeCodeSettings,
      templates,
    };

    // Install section (ecosystem-tool install commands) — appears above the
    // preview cards so the install action is visible before users scroll
    // through the generated files. Only rendered when the framework has a
    // published distribution site URL, since the packs only exist at that
    // URL after a `fit-pathway build`. Must come after the stage-validity
    // guard below so an invalid stage id (e.g. from a stale bookmark) does
    // not pair the install card with a "Stage not found" error.
    function appendInstallSection() {
      const installSection = createInstallSection({
        discipline: humanDiscipline,
        track: humanTrack,
        siteUrl,
      });
      if (installSection) {
        previewContainer.appendChild(installSection);
      }
    }

    // Generate preview based on stage selection
    if (stage === ALL_STAGES_VALUE) {
      appendInstallSection();
      previewContainer.appendChild(createAllStagesPreview(context));
    } else {
      const stageObj = stages.find((s) => s.id === stage);
      if (!stageObj) {
        previewContainer.appendChild(
          div(
            { className: "empty-state" },
            p({ className: "text-muted" }, `Stage "${stage}" not found.`),
          ),
        );
        return;
      }
      appendInstallSection();
      previewContainer.appendChild(createSingleStagePreview(context, stageObj));
    }
  }

  // Subscribe to selection changes
  selection.subscribe(updatePreview);

  // Build the page
  const page = div(
    { className: "agent-builder-page wide" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, "🤖 Agent Team Builder"),
      p(
        { className: "page-description" },
        "Generate coding agent teams from discipline × track × stage combinations. " +
          "Export complete agent profiles and skill files for Claude Code.",
      ),
    ),

    // Form section
    div(
      { className: "agent-builder-form" },
      h2({}, "Select Components"),
      div(
        { className: "auto-grid-sm gap-lg" },
        // Discipline selector
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Discipline"),
          availableDisciplines.length > 0
            ? createDisciplineSelect({
                id: "agent-discipline-select",
                disciplines: availableDisciplines,
                initialValue: selection.get().discipline,
                placeholder: "Select a discipline...",
                onChange: (value) => {
                  // Update track options when discipline changes
                  updateTrackOptions(value);
                  // Reset track selection when discipline changes
                  selection.update((prev) => ({
                    ...prev,
                    discipline: value,
                    track: "",
                  }));
                },
                getDisplayName: (d) => d.specialization || d.name,
              })
            : p(
                { className: "text-muted" },
                "No disciplines have agent definitions.",
              ),
        ),
        // Track selector (dynamically filtered by discipline)
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Track"),
          (() => {
            // Wire up track select change handler
            trackSelectEl.addEventListener("change", (e) => {
              selection.update((prev) => ({ ...prev, track: e.target.value }));
            });
            // Initialize track options if discipline is pre-selected
            const initialDiscipline = selection.get().discipline;
            if (initialDiscipline) {
              updateTrackOptions(initialDiscipline);
              // Set initial track value if provided and valid
              const initialTrack = selection.get().track;
              const validTracks =
                getValidTracksForDiscipline(initialDiscipline);
              if (
                initialTrack &&
                validTracks.some((t) => t.id === initialTrack)
              ) {
                trackSelectEl.value = initialTrack;
              }
            }
            return trackSelectEl;
          })(),
        ),
        // Stage selector (dropdown with All Stages option)
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Stage"),
          createSelectWithValue({
            id: "agent-stage-select",
            items: stageOptions,
            initialValue: selection.get().stage,
            placeholder: "Select a stage...",
            onChange: (value) => {
              selection.update((prev) => ({ ...prev, stage: value }));
            },
            getDisplayName: (s) => s.name,
          }),
        ),
      ),
    ),

    // Preview section
    previewContainer,

    // Help section
    createHelpSection(),
  );

  render(page);

  // Trigger initial update if pre-selected
  if (initialDiscipline && initialTrack) {
    updatePreview(selection.get());
  }
}

/**
 * Create empty state message
 * @param {number} disciplineCount - Number of available disciplines
 * @param {number} trackCount - Number of available tracks
 * @returns {HTMLElement}
 */
function createEmptyState(disciplineCount, trackCount) {
  if (disciplineCount === 0 || trackCount === 0) {
    return div(
      { className: "empty-state" },
      p(
        { className: "text-muted" },
        "No agent definitions found. Add agent.yaml files to disciplines and tracks.",
      ),
    );
  }

  return div(
    { className: "empty-state" },
    p(
      { className: "text-muted" },
      "Select a discipline, track, and stage to generate agents.",
    ),
  );
}

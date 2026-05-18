/**
 * Agent builder page
 *
 * Single scrollable view for generating AI coding agent team configurations.
 * Multi-select checkboxes for disciplines, single-select dropdown for track.
 * Generates one agent per selected discipline × the chosen track.
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
import { deriveReferenceLevel } from "@forwardimpact/libskill/agent";
import { createMultiDisciplineSelect } from "../lib/form-controls.js";
import { createReactive } from "../lib/reactive.js";
import {
  deriveAgentData,
  createTeamPreview,
  createHelpSection,
} from "./agent-builder-preview.js";
import { createInstallSection } from "./agent-builder-install.js";
import { createDownloadButton } from "./agent-builder-download.js";

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
    const [agentRes, skillRes, installRes, referenceRes, claudeRes] =
      await Promise.all([
        fetch("./templates/agent.template.md"),
        fetch("./templates/skill.template.md"),
        fetch("./templates/skill-install.template.sh"),
        fetch("./templates/skill-reference.template.md"),
        fetch("./templates/claude.template.md"),
      ]);
    templateCache = {
      agent: await agentRes.text(),
      skill: await skillRes.text(),
      install: await installRes.text(),
      reference: await referenceRes.text(),
      claude: await claudeRes.text(),
    };
  }
  return templateCache;
}

/**
 * Render agent builder page
 */
export async function renderAgentBuilder() {
  const { data } = getState();
  const siteUrl = data.standard?.distribution?.siteUrl;

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
  const allAgentTracks = data.tracks.filter((t) => agentTrackIds.has(t.id));

  /**
   * Get tracks valid for a discipline that also have agent definitions
   * @param {string} disciplineId - Discipline ID
   * @returns {Array} - Valid tracks for the discipline
   */
  function getValidTracksForDiscipline(disciplineId) {
    const discipline = data.disciplines.find((d) => d.id === disciplineId);
    if (!discipline) return [];

    const validTracks = discipline.validTracks ?? [];
    const validTrackIds = validTracks.filter((t) => t !== null);

    return allAgentTracks.filter((t) => validTrackIds.includes(t.id));
  }

  /**
   * Get the union of valid tracks across multiple disciplines
   * @param {Set<string>} disciplineIds - Selected discipline IDs
   * @returns {Array} - Unique tracks valid for any selected discipline
   */
  function getUnionTracks(disciplineIds) {
    const seen = new Set();
    const result = [];
    for (const dId of disciplineIds) {
      for (const track of getValidTracksForDiscipline(dId)) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          result.push(track);
        }
      }
    }
    return result;
  }

  // Parse URL params for pre-selection
  // Supports: #/agent/d1,d2/track (disciplines comma-separated, single track)
  const hash = window.location.hash;
  const pathMatch = hash.match(/#\/agent\/([^/]+)(?:\/([^/?]+))?/);
  const initialDisciplines = pathMatch
    ? new Set(pathMatch[1].split(",").filter(Boolean))
    : new Set();
  const initialTrack = pathMatch && pathMatch[2] ? pathMatch[2] : "";

  // Track select element — options updated when disciplines change
  const trackSelectEl = select(
    { className: "form-select", id: "agent-track-select" },
    option({ value: "", disabled: true, selected: true }, "Select a track..."),
  );
  trackSelectEl.disabled = true;

  // Reactive selection state
  const selection = createReactive({
    disciplines: initialDisciplines,
    track: initialTrack,
  });

  /**
   * Update track select options based on selected disciplines
   */
  function updateTrackOptions() {
    const { disciplines, track } = selection.get();
    const unionTracks = getUnionTracks(disciplines);

    trackSelectEl.innerHTML = "";

    if (disciplines.size === 0) {
      trackSelectEl.appendChild(
        option(
          { value: "", disabled: true, selected: true },
          "Select disciplines first...",
        ),
      );
      trackSelectEl.disabled = true;
      return;
    }

    if (unionTracks.length === 0) {
      trackSelectEl.appendChild(
        option(
          { value: "", disabled: true, selected: true },
          "No tracks available for selected disciplines",
        ),
      );
      trackSelectEl.disabled = true;
      return;
    }

    trackSelectEl.appendChild(
      option(
        { value: "", disabled: true, selected: !track },
        "Select a track...",
      ),
    );

    unionTracks
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((t) => {
        const opt = option({ value: t.id }, t.name);
        if (t.id === track) opt.selected = true;
        trackSelectEl.appendChild(opt);
      });

    // Clear track if no longer valid
    const validIds = new Set(unionTracks.map((t) => t.id));
    if (track && !validIds.has(track)) {
      selection.update((prev) => ({ ...prev, track: "" }));
    }

    trackSelectEl.disabled = false;
  }

  trackSelectEl.addEventListener("change", (e) => {
    selection.update((prev) => ({ ...prev, track: e.target.value }));
  });

  // Preview container
  const previewContainer = div(
    { className: "agent-preview" },
    createEmptyState(availableDisciplines.length, allAgentTracks.length),
  );

  /**
   * Compute valid discipline x track combinations from current selection
   * @param {Set<string>} disciplines
   * @param {string} track - Single selected track ID
   * @returns {Array<{humanDiscipline, humanTrack, agentDiscipline, agentTrack}>}
   */
  function computeCombinations(disciplines, track) {
    if (!track) return [];
    const combos = [];
    for (const dId of disciplines) {
      const validTracks = getValidTracksForDiscipline(dId);
      if (!validTracks.some((t) => t.id === track)) continue;
      const humanDiscipline = data.disciplines.find((d) => d.id === dId);
      const humanTrack = data.tracks.find((t) => t.id === track);
      const agentDiscipline = agentData.disciplines.find((d) => d.id === dId);
      const agentTrack = agentData.tracks.find((t) => t.id === track);
      if (humanDiscipline && humanTrack && agentDiscipline && agentTrack) {
        combos.push({
          humanDiscipline,
          humanTrack,
          agentDiscipline,
          agentTrack,
        });
      }
    }
    return combos;
  }

  /**
   * Update the URL hash to reflect the current selection
   * @param {Set<string>} disciplines
   * @param {string} track
   */
  function syncUrlHash(disciplines, track) {
    if (disciplines.size === 0) return;
    const dPart = [...disciplines].join(",");
    const tPart = track ? `/${track}` : "";
    const newHash = `#/agent/${dPart}${tPart}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  /**
   * Build the derive-context for a single combo
   * @param {Object} combo
   * @param {Object} level
   * @returns {Object}
   */
  function buildDeriveContext(combo, level) {
    return {
      ...combo,
      level,
      skills: data.skills,
      capabilities: data.capabilities,
      behaviours: data.behaviours,
      agentBehaviours: agentData.behaviours,
      claudeSettings: agentData.claudeSettings,
      vscodeSettings: agentData.vscodeSettings,
      organizationalContext: agentData.organizationalContext,
      templates,
    };
  }

  /**
   * Merge a single derive result into the running aggregation, deduplicating skills and tools
   * @param {Object} agg - Running aggregation state
   * @param {Object} result - Output from deriveAgentData
   */
  function mergeResult(agg, result) {
    agg.allProfiles.push(result.profile);
    if (!agg.teamInstructionsContent && result.teamInstructionsContent) {
      agg.teamInstructionsContent = result.teamInstructionsContent;
    }
    for (const sf of result.skillFiles) {
      if (!agg.seenSkillDirs.has(sf.dirname)) {
        agg.seenSkillDirs.add(sf.dirname);
        agg.allSkillFiles.push(sf);
      }
    }
    for (const tool of result.toolkit) {
      if (!agg.seenTools.has(tool.name)) {
        agg.seenTools.add(tool.name);
        agg.allToolkit.push(tool);
      }
    }
  }

  /**
   * Aggregate derived agent data across all combos, deduplicating skills and tools
   * @param {Array} combos
   * @param {Object} level
   * @returns {{allProfiles: Array, allSkillFiles: Array, allToolkit: Array, teamInstructionsContent: string|null}}
   */
  function aggregateCombos(combos, level) {
    const agg = {
      allProfiles: [],
      allSkillFiles: [],
      allToolkit: [],
      seenSkillDirs: new Set(),
      seenTools: new Set(),
      teamInstructionsContent: null,
    };

    for (const combo of combos) {
      const context = buildDeriveContext(combo, level);
      mergeResult(agg, deriveAgentData(context));
    }

    return {
      allProfiles: agg.allProfiles,
      allSkillFiles: agg.allSkillFiles,
      allToolkit: agg.allToolkit,
      teamInstructionsContent: agg.teamInstructionsContent,
    };
  }

  /**
   * Render the preview container with install section and team preview
   * @param {Array} combos
   * @param {Object} aggregated - Output from aggregateCombos
   */
  function renderPreviewContent(combos, aggregated) {
    const { allProfiles, allSkillFiles, allToolkit, teamInstructionsContent } =
      aggregated;

    const installSection = createInstallSection({
      discipline: combos[0].humanDiscipline,
      track: combos[0].humanTrack,
      siteUrl,
    });
    if (installSection) {
      previewContainer.appendChild(installSection);
    }

    previewContainer.appendChild(
      createTeamPreview({
        profiles: allProfiles,
        skillFiles: allSkillFiles,
        toolkit: allToolkit,
        teamInstructionsContent,
        templates,
        downloadButton: createDownloadButton(
          allProfiles,
          allSkillFiles,
          agentData.claudeSettings,
          agentData.vscodeSettings,
          templates,
          teamInstructionsContent,
        ),
      }),
    );
  }

  /**
   * Update the preview when selection changes
   * @param {Object} sel - Current selection
   */
  function updatePreview({ disciplines, track }) {
    syncUrlHash(disciplines, track);
    previewContainer.innerHTML = "";

    const combos = computeCombinations(disciplines, track);

    if (combos.length === 0) {
      previewContainer.appendChild(
        createEmptyState(availableDisciplines.length, allAgentTracks.length),
      );
      return;
    }

    const level = deriveReferenceLevel(data.levels);
    const aggregated = aggregateCombos(combos, level);
    renderPreviewContent(combos, aggregated);
  }

  // Subscribe to selection changes
  selection.subscribe(updatePreview);

  // Build the page
  const page = div(
    { className: "agent-builder-page wide" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, "Agent Team Builder"),
      p(
        { className: "page-description" },
        "Generate coding agent teams from discipline x track combinations. " +
          "Select multiple disciplines and a track to build a full team. " +
          "Export complete agent profiles and skill files for Claude Code.",
      ),
    ),

    // Form section
    div(
      { className: "agent-builder-form" },
      h2({}, "Select Components"),
      div(
        { className: "auto-grid-sm gap-lg" },
        // Discipline multi-select
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Disciplines"),
          availableDisciplines.length > 0
            ? createMultiDisciplineSelect({
                id: "agent-discipline-select",
                disciplines: availableDisciplines,
                selected: selection.get().disciplines,
                onChange: (updated) => {
                  selection.update((prev) => ({
                    ...prev,
                    disciplines: updated,
                  }));
                  updateTrackOptions();
                },
                getDisplayName: (d) => d.specialization || d.name,
              })
            : p(
                { className: "text-muted" },
                "No disciplines have agent definitions.",
              ),
        ),
        // Track single-select (options filtered by selected disciplines)
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Track"),
          trackSelectEl,
        ),
      ),
    ),

    // Preview section
    previewContainer,

    // Help section
    createHelpSection(),
  );

  render(page);

  // Initialize track options and trigger preview if pre-selected
  updateTrackOptions();
  if (initialDisciplines.size > 0 && initialTrack) {
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
      "Select disciplines and a track to generate an agent team.",
    ),
  );
}

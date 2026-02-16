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
  h3,
  p,
  span,
  label,
  section,
  select,
  option,
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { loadAgentDataBrowser } from "../lib/yaml-loader.js";
import {
  generateStageAgentProfile,
  deriveStageAgent,
  generateSkillMarkdown,
  deriveAgentSkills,
  deriveReferenceGrade,
  deriveToolkit,
  buildAgentIndex,
} from "@forwardimpact/libpathway";
import {
  createSelectWithValue,
  createDisciplineSelect,
} from "../lib/form-controls.js";
import { createReactive } from "../lib/reactive.js";
import { getStageEmoji } from "../formatters/stage/shared.js";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { createFileCard } from "../components/file-card.js";
import { createToolkitTable } from "../formatters/toolkit/dom.js";
import { createDetailSection } from "../components/detail.js";

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

    // Get reference grade for derivation
    const grade = deriveReferenceGrade(data.grades);

    // Build agent index for all valid combinations
    const agentIndex = buildAgentIndex({
      disciplines: data.disciplines,
      tracks: data.tracks,
      stages,
      agentDisciplines: agentData.disciplines,
      agentTracks: agentData.tracks,
    });

    // Build context for generation
    const context = {
      humanDiscipline,
      humanTrack,
      agentDiscipline,
      agentTrack,
      grade,
      stages,
      skills: data.skills,
      behaviours: data.behaviours,
      agentBehaviours: agentData.behaviours,
      vscodeSettings: agentData.vscodeSettings,
      devcontainer: agentData.devcontainer,
      templates,
      agentIndex,
    };

    // Generate preview based on stage selection
    if (stage === ALL_STAGES_VALUE) {
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
          "Export complete agent profiles and skill files for GitHub Copilot.",
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

/**
 * Create preview for all stages
 * Shows cards for each stage agent and all skills
 * @param {Object} context - Generation context
 * @returns {HTMLElement}
 */
function createAllStagesPreview(context) {
  const {
    humanDiscipline,
    humanTrack,
    agentDiscipline,
    agentTrack,
    grade,
    stages,
    skills,
    behaviours,
    agentBehaviours,
    vscodeSettings,
    devcontainer,
    templates,
    agentIndex,
  } = context;

  // Generate all stage agents
  const stageAgents = stages.map((stage) => {
    const derived = deriveStageAgent({
      discipline: humanDiscipline,
      track: humanTrack,
      stage,
      grade,
      skills,
      behaviours,
      agentBehaviours,
      agentDiscipline,
      agentTrack,
      stages,
    });

    const profile = generateStageAgentProfile({
      discipline: humanDiscipline,
      track: humanTrack,
      stage,
      grade,
      skills,
      behaviours,
      agentBehaviours,
      agentDiscipline,
      agentTrack,
      stages,
      agentIndex,
    });

    return { stage, derived, profile };
  });

  // Get derived skills for skill cards
  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    grade,
    skills,
  });

  // Generate skill files
  const skillFiles = derivedSkills
    .map((derived) => skills.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown(skill, stages));

  // Derive toolkit from agent skills
  const toolkit = deriveToolkit({
    skillMatrix: derivedSkills,
    skills,
  });

  return div(
    { className: "agent-deployment" },

    // Download all button
    createDownloadAllButton(
      stageAgents,
      skillFiles,
      vscodeSettings,
      devcontainer,
      context,
    ),

    // Agents section
    section(
      { className: "agent-section" },
      h2({}, `Agents (${stageAgents.length})`),
      p(
        { className: "text-muted" },
        "Stage-specific agents with appropriate tools, constraints, and handoffs.",
      ),
      div(
        { className: "agent-cards-grid" },
        ...stageAgents.map(({ stage, profile }) => {
          const content = formatAgentProfile(profile, templates.agent);
          const stageEmoji = getStageEmoji(stages, stage.id);
          return createFileCard({
            header: [
              span({ className: "file-card-emoji" }, stageEmoji),
              h3({}, `${stage.name} Agent`),
            ],
            files: [
              {
                filename: profile.filename,
                content,
                language: "markdown",
              },
            ],
            maxHeight: 400,
          });
        }),
      ),
    ),

    // Skills section
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skillFiles.length})`),
      skillFiles.length > 0
        ? div(
            { className: "skill-cards-grid" },
            ...skillFiles.map((skill) => buildSkillFileCard(skill, templates)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found for this discipline.",
          ),
    ),

    // Tool Kit section
    toolkit.length > 0
      ? createDetailSection({
          title: `Tool Kit (${toolkit.length})`,
          content: createToolkitTable(toolkit),
        })
      : null,
  );
}

/**
 * Create preview for a single stage
 * @param {Object} context - Generation context
 * @param {Object} stage - Selected stage
 * @returns {HTMLElement}
 */
function createSingleStagePreview(context, stage) {
  const {
    humanDiscipline,
    humanTrack,
    agentDiscipline,
    agentTrack,
    grade,
    skills,
    behaviours,
    agentBehaviours,
    vscodeSettings,
    devcontainer,
    stages,
    templates,
    agentIndex,
  } = context;

  const profile = generateStageAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    stage,
    grade,
    skills,
    behaviours,
    agentBehaviours,
    agentDiscipline,
    agentTrack,
    stages,
    agentIndex,
  });

  // Get skills for this stage (using full derived skills)
  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    grade,
    skills,
  });

  const skillFiles = derivedSkills
    .map((d) => skills.find((s) => s.id === d.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown(skill, stages));

  // Derive toolkit from agent skills
  const toolkit = deriveToolkit({
    skillMatrix: derivedSkills,
    skills,
  });

  return div(
    { className: "agent-deployment" },

    // Download button for single stage
    createDownloadSingleButton(
      profile,
      skillFiles,
      vscodeSettings,
      devcontainer,
      templates,
    ),

    // Agents section (single card)
    section(
      { className: "agent-section" },
      h2({}, "Agent"),
      div(
        { className: "agent-cards-grid single" },
        (() => {
          const content = formatAgentProfile(profile, templates.agent);
          const stageEmoji = getStageEmoji(stages, stage.id);
          return createFileCard({
            header: [
              span({ className: "file-card-emoji" }, stageEmoji),
              h3({}, `${stage.name} Agent`),
            ],
            files: [
              {
                filename: profile.filename,
                content,
                language: "markdown",
              },
            ],
            maxHeight: 400,
          });
        })(),
      ),
    ),

    // Skills section
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skillFiles.length})`),
      skillFiles.length > 0
        ? div(
            { className: "skill-cards-grid" },
            ...skillFiles.map((skill) => buildSkillFileCard(skill, templates)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found for this discipline.",
          ),
    ),

    // Tool Kit section
    toolkit.length > 0
      ? createDetailSection({
          title: `Tool Kit (${toolkit.length})`,
          content: createToolkitTable(toolkit),
        })
      : null,
  );
}

/**
 * Build a file card for a skill with 1–3 file panes (accordion).
 * @param {Object} skill - Skill with frontmatter and body
 * @param {{skill: string, install: string, reference: string}} templates - Mustache templates
 * @returns {HTMLElement}
 */
function buildSkillFileCard(skill, templates) {
  const content = formatAgentSkill(skill, templates.skill);

  /** @type {import('../components/file-card.js').FileDescriptor[]} */
  const files = [
    {
      filename: `${skill.dirname}/SKILL.md`,
      content,
      language: "markdown",
    },
  ];

  if (skill.installScript) {
    files.push({
      filename: `${skill.dirname}/scripts/install.sh`,
      content: formatInstallScript(skill, templates.install),
      language: "bash",
    });
  }

  if (skill.implementationReference) {
    files.push({
      filename: `${skill.dirname}/references/REFERENCE.md`,
      content: formatReference(skill, templates.reference),
      language: "markdown",
    });
  }

  const headerChildren = [
    span({ className: "file-card-name" }, skill.frontmatter.name),
  ];
  if (files.length > 1) {
    headerChildren.push(
      span({ className: "file-card-badge" }, `${files.length} files`),
    );
  }

  return createFileCard({
    header: headerChildren,
    files,
    maxHeight: 300,
  });
}

/**
 * Create download all button for all stages
 * @param {Array} stageAgents - Array of {stage, derived, profile}
 * @param {Array} skillFiles - Array of skill file objects
 * @param {Object} vscodeSettings - VS Code settings
 * @param {Object} devcontainer - Devcontainer config
 * @param {Object} context - Context with discipline/track info and templates
 * @returns {HTMLElement}
 */
function createDownloadAllButton(
  stageAgents,
  skillFiles,
  vscodeSettings,
  devcontainer,
  context,
) {
  const { humanDiscipline, humanTrack, templates } = context;
  const agentName = `${humanDiscipline.id}-${humanTrack.id}`.replace(/_/g, "-");

  const btn = document.createElement("button");
  btn.className = "btn btn-primary download-all-btn";
  btn.textContent = "📦 Download All (.zip)";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const JSZip = await importJSZip();
      const zip = new JSZip();

      // Add all stage agent profiles
      for (const { profile } of stageAgents) {
        const content = formatAgentProfile(profile, templates.agent);
        zip.file(`.github/agents/${profile.filename}`, content);
      }

      // Add skills (SKILL.md + optional install script + optional reference)
      for (const skill of skillFiles) {
        const content = formatAgentSkill(skill, templates.skill);
        zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, content);

        if (skill.installScript) {
          const installContent = formatInstallScript(skill, templates.install);
          zip.file(
            `.claude/skills/${skill.dirname}/scripts/install.sh`,
            installContent,
            { unixPermissions: "755" },
          );
        }

        if (skill.implementationReference) {
          const refContent = formatReference(skill, templates.reference);
          zip.file(
            `.claude/skills/${skill.dirname}/references/REFERENCE.md`,
            refContent,
          );
        }
      }

      // Add VS Code settings
      if (Object.keys(vscodeSettings).length > 0) {
        zip.file(
          ".vscode/settings.json",
          JSON.stringify(vscodeSettings, null, 2) + "\n",
        );
      }

      // Add devcontainer.json with VS Code settings embedded
      if (devcontainer && Object.keys(devcontainer).length > 0) {
        const devcontainerJson = {
          ...devcontainer,
          customizations: {
            vscode: {
              settings: vscodeSettings,
            },
          },
        };
        zip.file(
          ".devcontainer/devcontainer.json",
          JSON.stringify(devcontainerJson, null, 2) + "\n",
        );
      }

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `${agentName}-agents.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } finally {
      btn.disabled = false;
      btn.textContent = "📦 Download All (.zip)";
    }
  });

  return btn;
}

/**
 * Create download button for single stage
 * @param {Object} profile - Agent profile
 * @param {Array} skillFiles - Skill files
 * @param {Object} vscodeSettings - VS Code settings
 * @param {Object} devcontainer - Devcontainer config
 * @param {{agent: string, skill: string}} templates - Mustache templates
 * @returns {HTMLElement}
 */
function createDownloadSingleButton(
  profile,
  skillFiles,
  vscodeSettings,
  devcontainer,
  templates,
) {
  const btn = document.createElement("button");
  btn.className = "btn btn-primary download-all-btn";
  btn.textContent = "📥 Download Agent (.zip)";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const JSZip = await importJSZip();
      const zip = new JSZip();

      // Add profile
      const content = formatAgentProfile(profile, templates.agent);
      zip.file(`.github/agents/${profile.filename}`, content);

      // Add skills (SKILL.md + optional install script + optional reference)
      for (const skill of skillFiles) {
        const skillContent = formatAgentSkill(skill, templates.skill);
        zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, skillContent);

        if (skill.installScript) {
          const installContent = formatInstallScript(skill, templates.install);
          zip.file(
            `.claude/skills/${skill.dirname}/scripts/install.sh`,
            installContent,
            { unixPermissions: "755" },
          );
        }

        if (skill.implementationReference) {
          const refContent = formatReference(skill, templates.reference);
          zip.file(
            `.claude/skills/${skill.dirname}/references/REFERENCE.md`,
            refContent,
          );
        }
      }

      // Add VS Code settings
      if (Object.keys(vscodeSettings).length > 0) {
        zip.file(
          ".vscode/settings.json",
          JSON.stringify(vscodeSettings, null, 2) + "\n",
        );
      }

      // Add devcontainer.json with VS Code settings embedded
      if (devcontainer && Object.keys(devcontainer).length > 0) {
        const devcontainerJson = {
          ...devcontainer,
          customizations: {
            vscode: {
              settings: vscodeSettings,
            },
          },
        };
        zip.file(
          ".devcontainer/devcontainer.json",
          JSON.stringify(devcontainerJson, null, 2) + "\n",
        );
      }

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `${profile.frontmatter.name}-agent.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } finally {
      btn.disabled = false;
      btn.textContent = "📥 Download Agent (.zip)";
    }
  });

  return btn;
}

/**
 * Dynamically import JSZip from CDN
 * @returns {Promise<typeof JSZip>}
 */
async function importJSZip() {
  const module = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return module.default;
}

/**
 * Create help section explaining how agent builder works
 * @returns {HTMLElement}
 */
function createHelpSection() {
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "How It Works"),
    div(
      { className: "auto-grid-md" },
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Stages"),
        p(
          {},
          "Agents are generated for each stage: Plan (research), Code (implement), and Review (verify). " +
            "Each stage has specific tools, constraints, and handoffs.",
        ),
      ),
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Agent Profiles"),
        p(
          {},
          "The .agent.md files contain the agent's identity, capabilities, and constraints. " +
            "Place them in .github/agents/ to register with GitHub Copilot.",
        ),
      ),
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "Skills"),
        p(
          {},
          "SKILL.md files provide specialized knowledge that agents can use. " +
            "Place them in .claude/skills/{skill-name}/ directories.",
        ),
      ),
      div(
        { className: "detail-item" },
        div({ className: "detail-item-label" }, "All Stages"),
        p(
          {},
          "Select 'All Stages' to download a complete agent deployment with all stage agents and skills in one zip file.",
        ),
      ),
    ),
  );
}

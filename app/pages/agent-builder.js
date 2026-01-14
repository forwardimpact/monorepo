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
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { loadAgentDataBrowser } from "../lib/yaml-loader.js";
import {
  generateStageAgentProfile,
  deriveStageAgent,
  generateSkillMd,
  deriveAgentSkills,
  deriveReferenceGrade,
} from "../model/agent.js";
import { createSelectWithValue } from "../lib/form-controls.js";
import { createReactive } from "../lib/reactive.js";
import { getStageEmoji } from "../formatters/stage/shared.js";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import { formatAgentSkill } from "../formatters/agent/skill.js";

/** All stages option value */
const ALL_STAGES_VALUE = "all";

/** @type {Object|null} Cached agent data */
let agentDataCache = null;

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

  // Load agent-specific data
  const agentData = await getAgentData();

  // Filter to only disciplines/tracks that have agent definitions
  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  const availableDisciplines = data.disciplines.filter((d) =>
    agentDisciplineIds.has(d.id),
  );
  const availableTracks = data.tracks.filter((t) => agentTrackIds.has(t.id));
  const stages = data.stages || [];

  // Build stage options with "All Stages" first
  const stageOptions = [
    { id: ALL_STAGES_VALUE, name: "All Stages" },
    ...stages.map((s) => ({
      id: s.id,
      name: `${getStageEmoji(stages, s.id)} ${s.name}`,
    })),
  ];

  // Parse URL params for pre-selection
  const hash = window.location.hash;
  const pathMatch = hash.match(/#\/agent\/([^/]+)\/([^/]+)(?:\/([^/?]+))?/);
  const initialDiscipline = pathMatch ? pathMatch[1] : "";
  const initialTrack = pathMatch ? pathMatch[2] : "";
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
    createEmptyState(availableDisciplines.length, availableTracks.length),
  );

  /**
   * Update the preview when selection changes
   * @param {Object} sel - Current selection
   */
  function updatePreview({ discipline, track, stage }) {
    // Update URL without triggering navigation
    if (discipline && track) {
      const stagePart = stage && stage !== ALL_STAGES_VALUE ? `/${stage}` : "";
      const newHash = `#/agent/${discipline}/${track}${stagePart}`;
      if (window.location.hash !== newHash) {
        history.replaceState(null, "", newHash);
      }
    }

    previewContainer.innerHTML = "";

    if (!discipline || !track) {
      previewContainer.appendChild(
        createEmptyState(availableDisciplines.length, availableTracks.length),
      );
      return;
    }

    // Get full objects
    const humanDiscipline = data.disciplines.find((d) => d.id === discipline);
    const humanTrack = data.tracks.find((t) => t.id === track);
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
      capabilities: data.capabilities,
      vscodeSettings: agentData.vscodeSettings,
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
      h1({ className: "page-title" }, "🤖 Agent Builder"),
      p(
        { className: "page-description" },
        "Generate AI coding agents from discipline × track × stage combinations. " +
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
            ? createSelectWithValue({
                id: "agent-discipline-select",
                items: availableDisciplines,
                initialValue: selection.get().discipline,
                placeholder: "Select a discipline...",
                onChange: (value) => {
                  selection.update((prev) => ({ ...prev, discipline: value }));
                },
                getDisplayName: (d) => d.specialization || d.name,
              })
            : p(
                { className: "text-muted" },
                "No disciplines have agent definitions.",
              ),
        ),
        // Track selector
        div(
          { className: "form-group" },
          label({ className: "form-label" }, "Track"),
          availableTracks.length > 0
            ? createSelectWithValue({
                id: "agent-track-select",
                items: availableTracks,
                initialValue: selection.get().track,
                placeholder: "Select a track...",
                onChange: (value) => {
                  selection.update((prev) => ({ ...prev, track: value }));
                },
                getDisplayName: (t) => t.name,
              })
            : p(
                { className: "text-muted" },
                "No tracks have agent definitions.",
              ),
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
    capabilities,
    vscodeSettings,
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
      capabilities,
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
      capabilities,
      stages,
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
    .map((skill) => generateSkillMd(skill));

  return div(
    { className: "agent-deployment" },

    // Download all button
    createDownloadAllButton(stageAgents, skillFiles, vscodeSettings, context),

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
        ...stageAgents.map(({ stage, profile }) =>
          createAgentCard(stage, profile, stages),
        ),
      ),
    ),

    // Skills section
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skillFiles.length})`),
      skillFiles.length > 0
        ? div(
            { className: "skill-cards-grid" },
            ...skillFiles.map((skill) => createSkillCard(skill)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found for this discipline.",
          ),
    ),

    // CLI hint
    createCliHint(humanDiscipline.id, humanTrack.id),
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
    capabilities,
    vscodeSettings,
    stages,
  } = context;

  // Derive stage agent
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
    capabilities,
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
    capabilities,
    stages,
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
    .map((skill) => generateSkillMd(skill));

  return div(
    { className: "agent-deployment" },

    // Download button for single stage
    createDownloadSingleButton(profile, skillFiles, vscodeSettings),

    // Agents section (single card)
    section(
      { className: "agent-section" },
      h2({}, "Agent"),
      div(
        { className: "agent-cards-grid single" },
        createAgentCard(stage, profile, stages, derived),
      ),
    ),

    // Skills section
    section(
      { className: "agent-section" },
      h2({}, `Skills (${skillFiles.length})`),
      skillFiles.length > 0
        ? div(
            { className: "skill-cards-grid" },
            ...skillFiles.map((skill) => createSkillCard(skill)),
          )
        : p(
            { className: "text-muted" },
            "No skills with agent sections found for this discipline.",
          ),
    ),

    // CLI hint
    createCliHint(humanDiscipline.id, humanTrack.id, stage.id),
  );
}

/**
 * Create an agent card for a stage
 * @param {Object} stage - Stage object
 * @param {Object} profile - Generated profile
 * @param {Array} stages - All stages for emoji lookup
 * @param {Object} [_derived] - Optional derived agent data for extra info
 * @returns {HTMLElement}
 */
function createAgentCard(stage, profile, stages, _derived) {
  const content = formatAgentProfile(profile);
  const stageEmoji = getStageEmoji(stages, stage.id);

  const card = div(
    { className: "agent-card" },
    div(
      { className: "agent-card-header" },
      div(
        { className: "agent-card-title" },
        span({ className: "agent-card-emoji" }, stageEmoji),
        h3({}, `${stage.name} Agent`),
      ),
      createCopyButton(content),
    ),
    p({ className: "agent-card-filename" }, profile.filename),
    div({ className: "agent-card-preview" }, createCodePreview(content)),
  );

  return card;
}

/**
 * Create a skill card
 * @param {Object} skill - Skill with frontmatter and body
 * @returns {HTMLElement}
 */
function createSkillCard(skill) {
  const content = formatAgentSkill(skill);
  const filename = `${skill.dirname}/SKILL.md`;

  return div(
    { className: "skill-card" },
    div(
      { className: "skill-card-header" },
      span({ className: "skill-card-name" }, skill.frontmatter.name),
      createCopyButton(content),
    ),
    p({ className: "skill-card-filename" }, filename),
    div({ className: "skill-card-preview" }, createCodePreview(content)),
  );
}

/**
 * Create a code preview element
 * @param {string} content - Code content
 * @returns {HTMLElement}
 */
function createCodePreview(content) {
  const pre = document.createElement("pre");
  pre.className = "code-block code-preview";

  const code = document.createElement("code");
  code.textContent = content;

  pre.appendChild(code);
  return pre;
}

/**
 * Create a copy button
 * @param {string} content - Content to copy
 * @returns {HTMLElement}
 */
function createCopyButton(content) {
  const btn = document.createElement("button");
  btn.className = "btn btn-sm copy-btn";
  btn.textContent = "📋 Copy";

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content);
      btn.textContent = "✓ Copied";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
      }, 2000);
    } catch {
      btn.textContent = "Failed";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
      }, 2000);
    }
  });

  return btn;
}

/**
 * Create download all button for all stages
 * @param {Array} stageAgents - Array of {stage, derived, profile}
 * @param {Array} skillFiles - Array of skill file objects
 * @param {Object} vscodeSettings - VS Code settings
 * @param {Object} context - Context with discipline/track info
 * @returns {HTMLElement}
 */
function createDownloadAllButton(
  stageAgents,
  skillFiles,
  vscodeSettings,
  context,
) {
  const { humanDiscipline, humanTrack } = context;
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
        const content = formatAgentProfile(profile);
        zip.file(`.github/agents/${profile.filename}`, content);
      }

      // Add skills
      for (const skill of skillFiles) {
        const content = formatAgentSkill(skill);
        zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, content);
      }

      // Add VS Code settings
      if (Object.keys(vscodeSettings).length > 0) {
        zip.file(
          ".vscode/settings.json",
          JSON.stringify(vscodeSettings, null, 2) + "\n",
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
 * @returns {HTMLElement}
 */
function createDownloadSingleButton(profile, skillFiles, vscodeSettings) {
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
      const content = formatAgentProfile(profile);
      zip.file(`.github/agents/${profile.filename}`, content);

      // Add skills
      for (const skill of skillFiles) {
        const skillContent = formatAgentSkill(skill);
        zip.file(`.claude/skills/${skill.dirname}/SKILL.md`, skillContent);
      }

      // Add VS Code settings
      if (Object.keys(vscodeSettings).length > 0) {
        zip.file(
          ".vscode/settings.json",
          JSON.stringify(vscodeSettings, null, 2) + "\n",
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
 * Create CLI hint section
 * @param {string} disciplineId - Discipline ID
 * @param {string} trackId - Track ID
 * @param {string} [stageId] - Optional stage ID
 * @returns {HTMLElement}
 */
function createCliHint(disciplineId, trackId, stageId) {
  const stageArg = stageId ? ` --stage=${stageId}` : "";
  const command = `npx pathway agent ${disciplineId} ${trackId}${stageArg} --output=.github`;

  const container = section(
    { className: "agent-section cli-hint" },
    h2({}, "CLI Alternative"),
    p({}, "Generate this agent from the command line:"),
    div(
      { className: "cli-command" },
      createCodePreview(command),
      createCopyButton(command),
    ),
  );

  return container;
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

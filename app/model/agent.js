/**
 * Agent Generation Model
 *
 * Pure functions for generating AI coding agent configurations
 * from Engineering Pathway data. Outputs follow GitHub Copilot specifications:
 * - Agent Profiles (.agent.md files)
 * - Agent Skills (SKILL.md files)
 *
 * Agent profiles are derived using the SAME modifier logic as human job profiles.
 * Emphasized behaviours and skills (those with positive modifiers) drive agent
 * identity, creating distinct profiles for each discipline × track combination.
 *
 * Stage-based agents (plan, code, review) use lifecycle stages for tool sets,
 * handoffs, and constraints. See concept/lifecycle.md for details.
 *
 * NOTE: This module uses prepareAgentProfile() from profile.js for unified
 * skill/behaviour derivation. The deriveAgentSkills() and deriveAgentBehaviours()
 * functions are thin wrappers for backward compatibility.
 */

import { deriveSkillMatrix, deriveBehaviourProfile } from "./derivation.js";
import { deriveChecklist, formatChecklistMarkdown } from "./checklist.js";
import {
  filterSkillsForAgent,
  sortByLevelDescending,
  sortByMaturityDescending,
} from "./profile.js";
import { SkillLevel } from "./levels.js";

/**
 * Derive the reference grade for agent generation.
 *
 * The reference grade determines the skill and behaviour expectations for agents.
 * We select the first grade where primary skills reach "practitioner" level,
 * as this represents substantive senior-level expertise suitable for AI agents.
 *
 * Fallback logic:
 * 1. First grade with practitioner-level primary skills
 * 2. First grade with working-level primary skills (if no practitioner found)
 * 3. Middle grade by level (if neither found)
 *
 * @param {Array<Object>} grades - Array of grade definitions, each with baseSkillLevels.primary
 * @returns {Object} The reference grade
 * @throws {Error} If no grades are provided
 */
export function deriveReferenceGrade(grades) {
  if (!grades || grades.length === 0) {
    throw new Error("No grades configured");
  }

  // Sort by level to ensure consistent ordering
  const sorted = [...grades].sort((a, b) => a.ordinalRank - b.ordinalRank);

  // First: find the first grade with practitioner-level primary skills
  const practitionerGrade = sorted.find(
    (g) => g.baseSkillLevels?.primary === SkillLevel.PRACTITIONER,
  );
  if (practitionerGrade) {
    return practitionerGrade;
  }

  // Fallback: find the first grade with working-level primary skills
  const workingGrade = sorted.find(
    (g) => g.baseSkillLevels?.primary === SkillLevel.WORKING,
  );
  if (workingGrade) {
    return workingGrade;
  }

  // Final fallback: use the middle grade
  const middleIndex = Math.floor(sorted.length / 2);
  return sorted[middleIndex];
}

/**
 * Discipline ID to abbreviation mapping for file naming
 * Falls back to first letters of discipline name if not specified
 * @type {Object.<string, string>}
 */
const DISCIPLINE_ABBREVIATIONS = {
  software_engineering: "se",
  data_engineering: "de",
};

/**
 * Get abbreviation for a discipline ID
 * Falls back to first two letters if no mapping exists
 * @param {string} disciplineId - Discipline identifier
 * @returns {string} Short form abbreviation
 */
export function getDisciplineAbbreviation(disciplineId) {
  return DISCIPLINE_ABBREVIATIONS[disciplineId] || disciplineId.slice(0, 2);
}

/**
 * Convert snake_case id to kebab-case for agent naming
 * @param {string} id - Snake case identifier
 * @returns {string} Kebab case identifier
 */
export function toKebabCase(id) {
  return id.replace(/_/g, "-");
}

/**
 * Derive agent skills using the unified profile system
 * Returns skills sorted by level (highest first) for the given discipline × track
 * Excludes human-only skills and keeps only skills at the highest derived level.
 * This approach respects track modifiers—a broad skill boosted to the same level
 * as primary skills will be included.
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.grade - Reference grade for derivation
 * @param {Array} params.skills - All available skills
 * @returns {Array} Skills sorted by derived level (highest first)
 */
export function deriveAgentSkills({ discipline, track, grade, skills }) {
  // Use shared derivation
  const skillMatrix = deriveSkillMatrix({
    discipline,
    grade,
    track,
    skills,
  });

  // Apply agent-specific filtering and sorting
  const filtered = filterSkillsForAgent(skillMatrix);
  return sortByLevelDescending(filtered);
}

/**
 * Derive agent behaviours using the unified profile system
 * Returns behaviours sorted by maturity (highest first) for the given discipline × track
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.grade - Reference grade for derivation
 * @param {Array} params.behaviours - All available behaviours
 * @returns {Array} Behaviours sorted by derived maturity (highest first)
 */
export function deriveAgentBehaviours({
  discipline,
  track,
  grade,
  behaviours,
}) {
  const profile = deriveBehaviourProfile({
    discipline,
    grade,
    track,
    behaviours,
  });

  return sortByMaturityDescending(profile);
}

/**
 * Substitute template variables in text
 * @param {string} text - Text with {roleTitle}, {specialization} placeholders
 * @param {Object} discipline - Discipline with roleTitle, specialization properties
 * @returns {string} Text with substituted values
 */
function substituteTemplateVars(text, discipline) {
  return text
    .replace(/\{roleTitle\}/g, discipline.roleTitle)
    .replace(/\{specialization\}/g, discipline.specialization);
}

/**
 * Find an agent behaviour by id
 * @param {Array} agentBehaviours - Array of agent behaviour definitions
 * @param {string} id - Behaviour id to find
 * @returns {Object|undefined} Agent behaviour or undefined
 */
function findAgentBehaviour(agentBehaviours, id) {
  return agentBehaviours.find((b) => b.id === id);
}

/**
 * Build working style section from emphasized behaviours
 * Includes workflow patterns when available
 * @param {Array} derivedBehaviours - Behaviours sorted by maturity (highest first)
 * @param {Array} agentBehaviours - Agent behaviour definitions with principles
 * @param {number} topN - Number of top behaviours to include
 * @returns {string} Working style markdown section
 */
function buildWorkingStyleFromBehaviours(
  derivedBehaviours,
  agentBehaviours,
  topN = 3,
) {
  const sections = [];
  sections.push("## Working Style");
  sections.push("");

  // Get top N behaviours by maturity
  const topBehaviours = derivedBehaviours.slice(0, topN);

  for (const derived of topBehaviours) {
    const agentBehaviour = findAgentBehaviour(
      agentBehaviours,
      derived.behaviourId,
    );
    // Skip if no agent behaviour data or no content to display
    if (!agentBehaviour) continue;
    if (!agentBehaviour.workingStyle && !agentBehaviour.principles) continue;

    // Use title as section header
    const title = agentBehaviour.title || derived.behaviourName;
    sections.push(`### ${title}`);
    sections.push("");

    // Include workingStyle if available (structured guidance)
    if (agentBehaviour.workingStyle) {
      sections.push(agentBehaviour.workingStyle.trim());
      sections.push("");
    } else if (agentBehaviour.principles) {
      // Fall back to principles
      const principles = agentBehaviour.principles.trim();
      sections.push(principles);
      sections.push("");
    }
  }

  return sections.join("\n");
}

/**
 * Generate SKILL.md content from skill data
 * @param {Object} skillData - Skill with agent section containing stages
 * @param {Array} stages - All stage entities
 * @returns {Object} Skill with frontmatter, title, stages array, reference, dirname
 */
export function generateSkillMd(skillData, stages) {
  const { agent, name } = skillData;

  if (!agent) {
    throw new Error(`Skill ${skillData.id} has no agent section`);
  }

  if (!agent.stages) {
    throw new Error(`Skill ${skillData.id} agent section missing stages`);
  }

  // Build stage lookup map
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // Transform stages object to array for template rendering
  const stagesArray = Object.entries(agent.stages).map(
    ([stageId, stageData]) => {
      const stageEntity = stageMap.get(stageId);
      const stageName = stageEntity?.name || stageId;

      // Find next stage from handoffs
      let nextStageName = "Complete";
      if (stageEntity?.handoffs) {
        const nextHandoff = stageEntity.handoffs.find(
          (h) => h.targetStage !== stageId,
        );
        if (nextHandoff) {
          const nextStage = stageMap.get(nextHandoff.targetStage);
          nextStageName = nextStage?.name || nextHandoff.targetStage;
        }
      }

      return {
        stageId,
        stageName,
        nextStageName,
        focus: stageData.focus,
        activities: stageData.activities || [],
        ready: stageData.ready || [],
      };
    },
  );

  // Sort stages in order: plan, code, review
  const stageOrder = ["plan", "code", "review"];
  stagesArray.sort(
    (a, b) => stageOrder.indexOf(a.stageId) - stageOrder.indexOf(b.stageId),
  );

  return {
    frontmatter: {
      name: agent.name,
      description: agent.description,
      useWhen: agent.useWhen || "",
    },
    title: name,
    stages: stagesArray,
    reference: skillData.implementationReference || "",
    toolReferences: skillData.toolReferences || [],
    dirname: agent.name,
  };
}

/**
 * Estimate total character length of bodyData fields
 * @param {Object} bodyData - Structured profile body data
 * @returns {number} Estimated character count
 */
function estimateBodyDataLength(bodyData) {
  let length = 0;

  // String fields
  const stringFields = [
    "title",
    "stageDescription",
    "identity",
    "priority",
    "delegation",
    "operationalContext",
    "workingStyle",
    "beforeHandoff",
  ];
  for (const field of stringFields) {
    if (bodyData[field]) {
      length += bodyData[field].length;
    }
  }

  // Array fields
  if (bodyData.skillIndex) {
    for (const skill of bodyData.skillIndex) {
      length +=
        skill.name.length + skill.dirname.length + skill.useWhen.length + 50;
    }
  }
  if (bodyData.beforeMakingChanges) {
    for (const item of bodyData.beforeMakingChanges) {
      length += item.text.length + 5; // +5 for "1. " prefix
    }
  }
  if (bodyData.constraints) {
    for (const c of bodyData.constraints) {
      length += c.length + 2; // +2 for "- " prefix
    }
  }

  return length;
}

/**
 * Validate agent profile against spec constraints
 * @param {Object} profile - Generated profile
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentProfile(profile) {
  const errors = [];

  // Required: description
  if (!profile.frontmatter.description) {
    errors.push("Missing required field: description");
  }

  // Name format (if provided)
  if (profile.frontmatter.name) {
    if (!/^[a-zA-Z0-9._-]+$/.test(profile.frontmatter.name)) {
      errors.push("Name contains invalid characters");
    }
  }

  // Body length limit (30,000 chars) - estimate from bodyData fields
  const bodyLength = estimateBodyDataLength(profile.bodyData);
  if (bodyLength > 30000) {
    errors.push(`Body exceeds 30,000 character limit (${bodyLength})`);
  }

  // Tools format
  if (profile.frontmatter.tools && !Array.isArray(profile.frontmatter.tools)) {
    errors.push("Tools must be an array");
  }

  return errors;
}

/**
 * Validate agent skill against spec constraints
 * @param {Object} skill - Generated skill
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentSkill(skill) {
  const errors = [];

  // Required: name
  if (!skill.frontmatter.name) {
    errors.push("Missing required field: name");
  } else {
    const name = skill.frontmatter.name;

    // Name format: lowercase, hyphens, 1-64 chars
    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push("Name must be lowercase alphanumeric with hyphens");
    }
    if (name.length > 64) {
      errors.push("Name exceeds 64 character limit");
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      errors.push("Name cannot start or end with hyphen");
    }
    if (name.includes("--")) {
      errors.push("Name cannot contain consecutive hyphens");
    }
  }

  // Required: description
  if (!skill.frontmatter.description) {
    errors.push("Missing required field: description");
  } else if (skill.frontmatter.description.length > 1024) {
    errors.push("Description exceeds 1024 character limit");
  }

  return errors;
}

// =============================================================================
// Stage-Based Agent Generation
// =============================================================================

/**
 * Derive handoff buttons for a stage-based agent
 * Generates handoff button definitions from stage.handoffs with rich prompts
 * that include summary instructions and target stage entry criteria
 * @param {Object} params - Parameters
 * @param {Object} params.stage - Stage definition
 * @param {Object} params.discipline - Human discipline definition (for naming)
 * @param {Object} params.track - Human track definition (for naming)
 * @param {Array} params.stages - All stages (to look up target stage entry criteria)
 * @returns {Array<{label: string, agent: string, prompt: string, send: boolean}>} Handoff definitions
 */
export function deriveHandoffs({ stage, discipline, track, stages }) {
  if (!stage.handoffs || stage.handoffs.length === 0) {
    return [];
  }

  // Build base name for target agents (matches filename without .agent.md)
  const abbrev = getDisciplineAbbreviation(discipline.id);
  const baseName = `${abbrev}-${toKebabCase(track.id)}`;

  return stage.handoffs.map((handoff) => {
    // Find the target stage to get its entry criteria
    const targetStage = stages.find((s) => s.id === handoff.targetStage);
    const entryCriteria = targetStage?.entryCriteria || [];

    // Build rich prompt - formatted for single-line display
    const promptParts = [handoff.prompt];

    // Add summary instruction
    promptParts.push(
      `Summarize what was completed in the ${stage.name} stage.`,
    );

    // Add entry criteria from target stage with inline numbered list
    if (entryCriteria.length > 0) {
      const formattedCriteria = entryCriteria
        .map((item, index) => `(${index + 1}) ${item}`)
        .join(", ");
      promptParts.push(
        `Before starting, the ${targetStage.name} stage requires: ${formattedCriteria}.`,
      );
      promptParts.push(
        `If critical items are missing, hand back to ${stage.name}.`,
      );
    }

    return {
      label: handoff.label,
      agent: `${baseName}-${handoff.targetStage}`,
      prompt: promptParts.join(" "),
      send: true,
    };
  });
}

/**
 * Get the handoff type for a stage (used for checklist derivation)
 * @param {string} stageId - Stage ID (plan, code, review)
 * @returns {string|null} Stage ID for checklist or null
 */
function getChecklistStage(stageId) {
  // Plan and code stages have checklists, review doesn't
  return stageId === "review" ? null : stageId;
}

/**
 * Build the profile body data for a stage-based agent
 * Returns structured data for template rendering
 * @param {Object} params - Parameters
 * @param {Object} params.stage - Stage definition
 * @param {Object} params.humanDiscipline - Human discipline definition
 * @param {Object} params.humanTrack - Human track definition
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Array} params.derivedSkills - Skills sorted by level
 * @param {Array} params.derivedBehaviours - Behaviours sorted by maturity
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Array} params.skills - All skill definitions (for agent section lookup)
 * @param {string} params.checklistMarkdown - Pre-formatted checklist markdown
 * @returns {Object} Structured profile body data
 */
function buildStageProfileBodyData({
  stage,
  humanDiscipline,
  humanTrack,
  agentDiscipline,
  agentTrack,
  derivedSkills,
  derivedBehaviours,
  agentBehaviours,
  skills,
  checklistMarkdown,
}) {
  const name = `${humanDiscipline.specialization || humanDiscipline.name} - ${humanTrack.name}`;
  const stageName = stage.name.charAt(0).toUpperCase() + stage.name.slice(1);

  // Build identity - prefer track, fall back to discipline
  const rawIdentity = agentTrack.identity || agentDiscipline.identity;
  const identity = substituteTemplateVars(rawIdentity, humanDiscipline);

  // Build priority - prefer track, fall back to discipline (optional)
  const rawPriority = agentTrack.priority || agentDiscipline.priority;
  const priority = rawPriority
    ? substituteTemplateVars(rawPriority, humanDiscipline)
    : null;

  // Build beforeMakingChanges list - prefer track, fall back to discipline
  const rawSteps =
    agentTrack.beforeMakingChanges || agentDiscipline.beforeMakingChanges || [];
  const beforeMakingChanges = rawSteps.map((text, i) => ({
    index: i + 1,
    text: substituteTemplateVars(text, humanDiscipline),
  }));

  // Delegation (from discipline only, optional)
  const rawDelegation = agentDiscipline.delegation;
  const delegation = rawDelegation
    ? substituteTemplateVars(rawDelegation, humanDiscipline)
    : null;

  // Build skill index from derived skills with agent sections
  const skillIndex = derivedSkills
    .map((derived) => {
      const skill = skills.find((s) => s.id === derived.skillId);
      if (!skill?.agent) return null;
      return {
        name: derived.skillName,
        dirname: skill.agent.name,
        useWhen: skill.agent.useWhen?.trim() || "",
      };
    })
    .filter(Boolean);

  // Operational Context - use track's roleContext (shared with human job descriptions)
  const operationalContext = humanTrack.roleContext.trim();

  // Working Style from derived behaviours (still markdown for now)
  const workingStyle = buildWorkingStyleFromBehaviours(
    derivedBehaviours,
    agentBehaviours,
    3,
  );

  // Constraints (stage + discipline + track)
  const constraints = [
    ...(stage.constraints || []),
    ...(agentDiscipline.constraints || []),
    ...(agentTrack.constraints || []),
  ];

  return {
    title: `${name} - ${stageName} Agent`,
    stageDescription: stage.description,
    identity: identity.trim(),
    priority: priority ? priority.trim() : null,
    skillIndex,
    beforeMakingChanges,
    delegation: delegation ? delegation.trim() : null,
    operationalContext,
    workingStyle,
    beforeHandoff: checklistMarkdown || null,
    constraints,
  };
}

/**
 * Derive a stage-specific agent profile
 * Combines discipline, track, and stage to produce a complete agent definition
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.stage - Stage definition from stages.yaml
 * @param {Object} params.grade - Reference grade for skill derivation
 * @param {Array} params.skills - All available skills
 * @param {Array} params.behaviours - All available behaviours
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Array} params.capabilities - Capabilities for checklist grouping
 * @param {Array} params.stages - All stages (for handoff entry criteria)
 * @returns {Object} Agent definition with skills, behaviours, tools, handoffs, constraints, checklist
 */
export function deriveStageAgent({
  discipline,
  track,
  stage,
  grade,
  skills,
  behaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
  capabilities,
  stages,
}) {
  // Derive skills and behaviours
  const derivedSkills = deriveAgentSkills({
    discipline,
    track,
    grade,
    skills,
  });

  const derivedBehaviours = deriveAgentBehaviours({
    discipline,
    track,
    grade,
    behaviours,
  });

  // Derive handoffs from stage
  const handoffs = deriveHandoffs({
    stage,
    discipline,
    track,
    stages,
  });

  // Derive checklist if applicable
  const checklistStage = getChecklistStage(stage.id);
  let checklist = [];
  if (checklistStage && capabilities) {
    checklist = deriveChecklist({
      stageId: checklistStage,
      skillMatrix: derivedSkills,
      skills,
      capabilities,
    });
  }

  return {
    stage,
    discipline,
    track,
    derivedSkills,
    derivedBehaviours,
    handoffs,
    constraints: [
      ...(stage.constraints || []),
      ...(agentDiscipline.constraints || []),
      ...(agentTrack.constraints || []),
    ],
    checklist,
    agentDiscipline,
    agentTrack,
    agentBehaviours,
  };
}

/**
 * Generate a stage-specific agent profile (.agent.md)
 * Produces the complete profile with frontmatter, bodyData, and filename
 * @param {Object} params - Parameters
 * @param {Object} params.discipline - Human discipline definition
 * @param {Object} params.track - Human track definition
 * @param {Object} params.stage - Stage definition
 * @param {Object} params.grade - Reference grade
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Array} params.agentBehaviours - Agent behaviour definitions
 * @param {Object} params.agentDiscipline - Agent discipline definition
 * @param {Object} params.agentTrack - Agent track definition
 * @param {Array} params.capabilities - Capabilities with checklists
 * @param {Array} params.stages - All stages (for handoff entry criteria)
 * @returns {Object} Profile with frontmatter, bodyData, and filename
 */
export function generateStageAgentProfile({
  discipline,
  track,
  stage,
  grade,
  skills,
  behaviours,
  agentBehaviours,
  agentDiscipline,
  agentTrack,
  capabilities,
  stages,
}) {
  // Derive the complete agent
  const agent = deriveStageAgent({
    discipline,
    track,
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

  // Build names (abbreviated form used consistently for filename, name, and handoffs)
  const abbrev = getDisciplineAbbreviation(discipline.id);
  const fullName = `${abbrev}-${toKebabCase(track.id)}-${stage.id}`;
  const filename = `${fullName}.agent.md`;

  // Build description
  const disciplineDesc = discipline.description.trim().split("\n")[0];
  const stageDesc = stage.description.split(" - ")[0]; // Just the short part
  const description = `${stageDesc} agent for ${discipline.specialization || discipline.name} on ${track.name} track. ${disciplineDesc}`;

  // Format checklist as markdown
  const checklistMarkdown = formatChecklistMarkdown(agent.checklist);

  // Build structured profile body data
  const bodyData = buildStageProfileBodyData({
    stage,
    humanDiscipline: discipline,
    humanTrack: track,
    agentDiscipline,
    agentTrack,
    derivedSkills: agent.derivedSkills,
    derivedBehaviours: agent.derivedBehaviours,
    agentBehaviours,
    skills,
    checklistMarkdown,
  });

  // Build frontmatter
  const frontmatter = {
    name: fullName,
    description,
    infer: true,
    ...(agent.handoffs.length > 0 && { handoffs: agent.handoffs }),
  };

  return {
    frontmatter,
    bodyData,
    filename,
  };
}

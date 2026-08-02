import { buildPreamble } from "./preamble.js";
import { PROFICIENCY_LEVELS } from "@forwardimpact/libsyntheticgen/vocabulary.js";

/**
 * Prompt template for a single capability entity (with skills).
 *
 * @param {object} skeleton - Capability skeleton { id, name, skills, ordinalRank }
 * @param {object} ctx - Terrain context
 * @param {object} schema - JSON schema for capability
 * @returns {{ system: string, user: string }}
 */
export function buildCapabilityPrompt(skeleton, ctx, schema, priorOutput) {
  return {
    system:
      buildPreamble(ctx.standardName || ctx.domain) +
      "\n\n" +
      [
        "You are an expert author of agent-aligned engineering standards.",
        "Output only valid JSON. Do not add markdown fences. Do not add explanations.",
        `The organization domain is: ${ctx.domain}.`,
        `Industry: ${ctx.industry}.`,
      ].join(" "),

    user: [
      "Generate a capability definition for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Skeleton`,
      `Capability ID: ${skeleton.id}`,
      `Capability name: ${skeleton.name}`,
      `Skills to define: ${skeleton.skills.join(", ")}`,
      `Ordinal rank: ${skeleton.ordinalRank}`,
      "",
      "## Instructions",
      "- id: Use the provided capability ID.",
      "- name: Use the provided name.",
      "- emojiIcon: Give one emoji that represents this capability.",
      `- ordinalRank: ${skeleton.ordinalRank}`,
      "- description: Write 1-2 sentences that describe this capability area.",
      "- professionalResponsibilities: Write one sentence for each proficiency",
      `  level (${PROFICIENCY_LEVELS.join(" through ")}). Describe the`,
      "  expectations for individual contributors.",
      "- managementResponsibilities: Do the same for the management track.",
      "- skills: For each skill ID in the skeleton, generate:",
      "  - id: Use the provided skill ID exactly.",
      "  - name: Write a human-readable name in title case.",
      "  - isHumanOnly: Set to true only for skills that require human",
      "    presence, human judgment, or interpersonal interaction. Examples:",
      "    people management, conflict resolution, mentoring, coaching, and",
      "    stakeholder negotiation. For technical skills, omit the field or",
      "    set it to false. Agent profiles exclude human-only skills.",
      "  - human.description: Write 2-3 sentences.",
      "  - human.proficiencyDescriptions: Write one paragraph for each level",
      `    (${PROFICIENCY_LEVELS.join(", ")}).`,
      '    Use the second person ("You..."). Each level must show clear',
      "    progression in scope, autonomy, and complexity.",
      "- For each skill that is not human-only, also generate an agent section:",
      "  - agent.description: Write 1 sentence that tells what this agent",
      "    skill provides.",
      "  - agent.useWhen: Write a verb-phrase fragment that completes the",
      '    sentence "Use when ___". Examples: "validating code changes",',
      '    "designing API contracts", "diagnosing performance issues".',
      '    Do not start with "Use when", "When", "Agents should", or a',
      "    subject plus a verb. Output a fragment only.",
      "  - agent.focus: Write 1 sentence that states the primary focus for",
      "    this skill.",
      "  - agent.readChecklist: Write an array of 5-9 items. Each item is a",
      "    step to read and understand before the agent acts.",
      "    Follow READ-DO semantics: read each item, then do it.",
      "  - agent.confirmChecklist: Write an array of 5-9 items. Each item is",
      "    a check to make after the work is complete.",
      "    Follow DO-CONFIRM semantics: do from memory, then confirm every item.",
      "  - markers: Write an object with one key for each proficiency level",
      `    (${PROFICIENCY_LEVELS.join(", ")}). Each level is an object with:`,
      "    - human: An array of 2-4 observable marker strings for human",
      "      engineers. Each marker is a short sentence that starts with a",
      "      past-tense verb. Example: 'Delivered a small feature end-to-end",
      "      with minimal rework'.",
      "    - agent: An array of 1-3 observable marker strings for AI agents.",
      "      Omit this array for skills that are human-only.",
      "    Markers describe concrete, observable evidence of skill",
      "    proficiency at that level. Higher levels show broader scope and",
      "    more autonomy.",
      "- Omit the agent section for each skill with isHumanOnly: true.",
      "",
      ...(priorOutput?.levels || priorOutput?.behaviours
        ? [
            "",
            "## Previously generated context",
            ...(priorOutput.levels && Array.isArray(priorOutput.levels)
              ? [
                  "Level titles and proficiency baselines:",
                  ...priorOutput.levels
                    .filter(Boolean)
                    .map(
                      (l) =>
                        `- ${l.id}: ${l.professionalTitle || l.id} (core: ${l.baseSkillProficiencies?.core || "N/A"})`,
                    ),
                ]
              : []),
            ...(priorOutput.behaviours && Array.isArray(priorOutput.behaviours)
              ? [
                  "Behaviour names:",
                  ...priorOutput.behaviours
                    .filter(Boolean)
                    .map(
                      (b) => `- ${b._id || b.id}: ${b.name || b._id || b.id}`,
                    ),
                ]
              : []),
          ]
        : []),
      "",
      "Output the JSON object for this single capability file.",
    ].join("\n"),
  };
}

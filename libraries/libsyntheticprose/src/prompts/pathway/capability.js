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
        "Output ONLY valid JSON. No markdown fences, no explanations.",
        `The organization domain is: ${ctx.domain}.`,
        `Industry: ${ctx.industry}.`,
      ].join(" "),

    user: [
      "Generate a capability definition for an agent-aligned engineering standard.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
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
      "- emojiIcon: A single emoji representing this capability.",
      `- ordinalRank: ${skeleton.ordinalRank}`,
      "- description: 1-2 sentences describing this capability area.",
      "- professionalResponsibilities: One sentence per proficiency level",
      `  (${PROFICIENCY_LEVELS.join(" through ")}) describing IC expectations.`,
      "- managementResponsibilities: Same for management track.",
      "- skills: For each skill ID listed above, generate:",
      "  - id: Use the provided skill ID exactly.",
      "  - name: Human-readable name (title case).",
      "  - isHumanOnly: Set to true ONLY for skills that inherently require",
      "    human presence, judgment, or interpersonal interaction (e.g.,",
      "    people management, conflict resolution, mentoring, coaching,",
      "    stakeholder negotiation). Omit (or set false) for technical skills.",
      "    Skills marked human-only are excluded from agent profiles.",
      "  - human.description: 2-3 sentences.",
      "  - human.proficiencyDescriptions: One paragraph per level",
      `    (${PROFICIENCY_LEVELS.join(", ")}).`,
      '    Use second-person ("You..."). Each level must show clear',
      "    progression in scope, autonomy, and complexity.",
      "- For each skill that is NOT human-only, also generate an agent section:",
      "  - agent.description: 1 sentence describing what this agent skill provides.",
      "  - agent.useWhen: A verb-phrase fragment that completes the sentence",
      '    "Use when ___". Examples: "validating code changes",',
      '    "designing API contracts", "diagnosing performance issues".',
      '    Do NOT start with "Use when", "When", "Agents should", or',
      "    any subject + verb construction. Output a fragment only.",
      "  - agent.focus: 1 sentence — the overall primary focus for this skill.",
      "  - agent.readChecklist: Array of 5-9 items — steps to read/understand before acting.",
      "    Follow READ-DO semantics: read each item, then do it.",
      "  - agent.confirmChecklist: Array of 5-9 items — items to verify after completing work.",
      "    Follow DO-CONFIRM semantics: do from memory, then confirm every item.",
      "  - markers: An object keyed by proficiency level",
      `    (${PROFICIENCY_LEVELS.join(", ")}). Each level is an object with:`,
      "    - human: Array of 2-4 observable marker strings for human engineers.",
      "      Each marker is a short sentence starting with a past-tense verb",
      "      (e.g., 'Delivered a small feature end-to-end with minimal rework').",
      "    - agent: Array of 1-3 observable marker strings for AI agents",
      "      (omit for skills marked isHumanOnly).",
      "    Markers describe concrete, observable evidence of skill proficiency",
      "    at that level. Higher levels show broader scope and autonomy.",
      "- Skills marked isHumanOnly: true MUST omit the agent section entirely.",
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

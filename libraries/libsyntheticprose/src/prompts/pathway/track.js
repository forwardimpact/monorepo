import { buildPreamble } from "./preamble.js";
import { buildPriorContextLines } from "./prior-context.js";

/**
 * Prompt template for a single track entity.
 *
 * @param {object} skeleton - Track skeleton { id, name }
 * @param {object} ctx - Terrain context (includes capabilityIds, behaviourIds)
 * @param {object} schema - JSON schema for track
 * @returns {{ system: string, user: string }}
 */
export function buildTrackPrompt(skeleton, ctx, schema, priorOutput) {
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
      "Generate a track definition for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Skeleton`,
      `Track ID: ${skeleton.id}`,
      `Track name: ${skeleton.name}`,
      "",
      `## Available capability IDs: ${(ctx.capabilityIds || []).join(", ")}`,
      `## Available behaviour IDs: ${(ctx.behaviourIds || []).join(", ")}`,
      "",
      "## Instructions",
      "- name: Use the provided name exactly.",
      "- description: Write 2-3 sentences that describe this track's focus.",
      "- roleContext: Write 1-2 sentences that put the role in context for",
      "  job listings.",
      "- skillModifiers: Write an object that maps capability IDs to integer",
      "  modifiers. Use values from -1 to 1. Include modifiers for the",
      "  capabilities that this track specialization affects most.",
      "- behaviourModifiers: Write an object that maps behaviour IDs to",
      "  integer modifiers (+1 or -1). Include 1-2 modifiers that emphasize",
      "  behaviours important for this track. The modifiers must differ from",
      "  the sibling tracks. For example, SRE boosts outcome ownership.",
      "  Platform boosts systems thinking. Security boosts precise",
      "  communication. ML Ops boosts relentless curiosity. The modifiers",
      "  must show the track's behaviour emphasis. Homogeneous modifiers",
      "  across tracks defeat the purpose.",
      "- assessmentWeights: Write { skillWeight, behaviourWeight }. The two",
      "  values must sum to 1.",
      "- agent.identity: Write 1 sentence that overrides the agent identity",
      "  for this track. You can use the {roleTitle} placeholder. Example:",
      "  'You specialize in platform infrastructure.'",
      "- agent.priority: Write 1 sentence that states the track-specific",
      "  priority.",
      "- agent.constraints: List 1-2 additional constraints specific to this",
      "  track.",
      "- agent.teamInstructions: Write 2-3 sentences of cross-cutting",
      "  context for an agent team that specializes in this track. Describe",
      "  the coordination patterns the team must follow. State what the team",
      "  must prioritize. State what the team must avoid. You can use the",
      "  {roleTitle} and {specialization} placeholders. The generator",
      "  substitutes these placeholders at generation time. This text drives",
      "  the team's CLAUDE.md file.",
      "",
      ...buildPriorContextLines(priorOutput),
      "",
      "Output a single JSON object for this track.",
    ].join("\n"),
  };
}

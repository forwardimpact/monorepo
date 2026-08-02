import { buildPreamble } from "./preamble.js";
import { buildPriorContextLines } from "./prior-context.js";

/**
 * Prompt template for a single discipline entity.
 *
 * @param {object} skeleton - Discipline skeleton from DSL
 * @param {object} ctx - Terrain context (includes skillIds, behaviourIds, trackIds)
 * @param {object} schema - JSON schema for discipline
 * @returns {{ system: string, user: string }}
 */
export function buildDisciplinePrompt(skeleton, ctx, schema, priorOutput) {
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
      "Generate a discipline definition for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Skeleton`,
      `Discipline ID: ${skeleton.id}`,
      `Role title: ${skeleton.roleTitle || skeleton.id.replace(/[-_]/g, " ")}`,
      `Specialization: ${skeleton.specialization || skeleton.roleTitle || skeleton.id.replace(/[-_]/g, " ")}`,
      `isProfessional: ${skeleton.isProfessional !== false}`,
      `Core skills: ${(skeleton.core || []).join(", ")}`,
      `Supporting skills: ${(skeleton.supporting || []).join(", ")}`,
      `Broad skills: ${(skeleton.broad || []).join(", ")}`,
      `Valid tracks: ${JSON.stringify(skeleton.validTracks || [null])}`,
      "",
      `## Available skill IDs: ${(ctx.skillIds || []).join(", ")}`,
      `## Available behaviour IDs: ${(ctx.behaviourIds || []).join(", ")}`,
      `## Available track IDs: ${(ctx.trackIds || []).join(", ")}`,
      "",
      "## Instructions",
      "- specialization: Use the provided specialization. If none exists,",
      "  generate one from the role title.",
      "- roleTitle: Use the provided role title.",
      "- isProfessional: Use the provided value.",
      "- isManagement: Set to true only for management disciplines.",
      "- validTracks: Use the provided array. A null value permits a",
      "  trackless generalist.",
      "- description: Write 2-3 sentences that describe this discipline.",
      "- coreSkills: Use the provided core skill IDs. Each ID must exist in",
      "  the available list.",
      "- supportingSkills: Use the provided supporting skill IDs.",
      "- broadSkills: Use the provided broad skill IDs.",
      "- behaviourModifiers: Write an object that maps behaviour IDs to",
      "  modifiers (-1, 0, or 1). Include 2-3 behaviour modifiers that apply",
      "  to this discipline. Different disciplines must produce different",
      "  modifier sets. Homogeneous modifiers defeat the purpose. For",
      "  example: engineering management boosts precise communication and",
      "  outcome ownership. Software engineering boosts systems thinking and",
      "  polymathic knowledge. Data engineering boosts relentless curiosity",
      "  and systems thinking. Quality engineering boosts outcome ownership",
      "  and precise communication. Clinical informatics boosts polymathic",
      "  knowledge and precise communication.",
      "- human.roleSummary: Write 2-3 sentences that describe this role. You",
      "  can use the {roleTitle} or {specialization} placeholder.",
      "- agent.identity: Write 1-2 sentences that define the AI coding",
      "  agent's core identity. Start with 'You are a {roleTitle} agent",
      "  that...'. You can use the {roleTitle} or {specialization}",
      "  placeholder.",
      "- agent.priority: Write 1 sentence that states the agent's top",
      "  priority. Examples: code quality, system reliability.",
      "- agent.constraints: List 2-3 things the agent must not do.",
      "",
      ...buildPriorContextLines(priorOutput),
      "",
      "Output a single JSON object for this discipline.",
    ].join("\n"),
  };
}

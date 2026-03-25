/**
 * Prompt template for a single discipline entity.
 *
 * @param {object} skeleton - Discipline skeleton from DSL
 * @param {object} ctx - Universe context (includes skillIds, behaviourIds, trackIds)
 * @param {object} schema - JSON schema for discipline
 * @returns {{ system: string, user: string }}
 */
export function buildDisciplinePrompt(skeleton, ctx, schema) {
  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate a discipline definition for a career framework.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Skeleton`,
      `Discipline ID: ${skeleton.id}`,
      `Role title: ${skeleton.roleTitle || skeleton.id.replace(/_/g, " ")}`,
      `Specialization: ${skeleton.specialization || skeleton.roleTitle || skeleton.id.replace(/_/g, " ")}`,
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
      "- specialization: Use the provided specialization or generate from role title.",
      "- roleTitle: Use the provided role title.",
      "- isProfessional: Use the provided value.",
      "- isManagement: Set to true only for management disciplines.",
      "- validTracks: Use the provided array. null means trackless/generalist is allowed.",
      "- description: 2-3 sentences describing this discipline.",
      "- coreSkills: Use the provided core skill IDs. Must all exist in available list.",
      "- supportingSkills: Use the provided supporting skill IDs.",
      "- broadSkills: Use the provided broad skill IDs.",
      "- behaviourModifiers: Object mapping behaviour IDs to modifiers (-1, 0, or 1).",
      "  Include 2-3 behaviour modifiers relevant to this discipline.",
      "- human.roleSummary: 2-3 sentences describing this role. May use {roleTitle} or {specialization}.",
      "- agent.identity: 1-2 sentences defining the AI coding agent's core identity.",
      "  Frame as 'You are a {roleTitle} agent that...' May use {roleTitle} or {roleName} placeholder.",
      "- agent.priority: 1 sentence stating the agent's top priority (e.g., code quality, system reliability).",
      "- agent.constraints: 2-3 things the agent must avoid or never do.",
      "",
      "Output a single JSON object for this discipline.",
    ].join("\n"),
  };
}

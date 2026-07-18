import { createGraphIndex } from "@forwardimpact/libgraph";

/**
 * Format one `fit-rag subjects` line — `subject<TAB>type`, byte-identical to
 * the old `fit-rag subjects` output.
 * @param {string} subject
 * @param {string} type
 * @returns {string}
 */
export function formatSubjectLine(subject, type) {
  return `${subject}\t${type}`;
}

/**
 * `fit-rag subjects` — list graph subjects, optionally filtered by type. Ports
 * `fit-rag subjects`.
 * @param {object} ctx
 * @param {string[]} ctx.positionals - Subcommand arguments: `[type]`
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ positionals, runtime }) {
  const type = positionals[0] || null;
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const subjects = await graphIndex.getSubjects(type);

  for (const [subject, subjectType] of subjects) {
    console.log(formatSubjectLine(subject, subjectType));
  }
}

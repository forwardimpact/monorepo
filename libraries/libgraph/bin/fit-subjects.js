#!/usr/bin/env node
import { createGraphIndex } from "@forwardimpact/libgraph";

/**
 * Lists graph subjects, optionally filtered by type
 * Usage: fit-subjects [type]
 * @returns {Promise<void>}
 */
async function main() {
  const type = process.argv[2] || null;
  const graphIndex = createGraphIndex("graphs");

  const subjects = await graphIndex.getSubjects(type);

  for (const [subject, subjectType] of subjects) {
    console.log(`${subject}\t${subjectType}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

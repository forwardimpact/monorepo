#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createGraphIndex } from "@forwardimpact/libgraph";

// `bun build --compile` injects FIT_SUBJECTS_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_SUBJECTS_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-subjects",
  version: VERSION,
  description: "List graph subjects, optionally filtered by type",
  usage: "fit-subjects [type]",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-subjects", "fit-subjects schema:Person"],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
const logger = createLogger("subjects", runtime);

/**
 * Lists graph subjects, optionally filtered by type
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const type = parsed.positionals[0] || null;
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const subjects = await graphIndex.getSubjects(type);

  for (const [subject, subjectType] of subjects) {
    console.log(`${subject}\t${subjectType}`);
  }
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});

#!/usr/bin/env node

import { createTraceCollector } from "@forwardimpact/libtrace";

/**
 * Process Claude Code stream-json NDJSON from stdin.
 *
 * Usage: fit-trace [--output-format text|json] < stream.ndjson
 *
 * Output formats:
 *   json  (default) — structured trace document for offline analysis
 *   text  — human-readable summary for workflow logs
 */
async function main() {
  const format = parseOutputFormat(process.argv);
  const collector = createTraceCollector();

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf8");

  for (const line of input.split("\n")) {
    collector.addLine(line);
  }

  if (format === "text") {
    process.stdout.write(collector.toText() + "\n");
  } else {
    process.stdout.write(JSON.stringify(collector.toJSON()) + "\n");
  }
}

/**
 * Parse --output-format from argv.
 * @param {string[]} argv
 * @returns {"text"|"json"}
 */
function parseOutputFormat(argv) {
  const idx = argv.indexOf("--output-format");
  if (idx !== -1 && idx + 1 < argv.length) {
    const value = argv[idx + 1];
    if (value === "text" || value === "json") {
      return value;
    }
    console.error(`Unknown output format: ${value}. Using "json".`);
  }
  return "json";
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

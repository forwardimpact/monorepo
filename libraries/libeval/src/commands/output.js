import { createTraceCollector } from "@forwardimpact/libeval";

/**
 * Output command — process a complete NDJSON trace from stdin and write
 * formatted output to stdout.
 *
 * Usage: fit-eval output [--format=json|text] < trace.ndjson
 *
 * @param {string[]} args - Command arguments
 */
export async function runOutputCommand(args) {
  const format = parseFormat(args);
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
 * Parse --format from args. Supports --format=value and --format value.
 * @param {string[]} args
 * @returns {"text"|"json"}
 */
function parseFormat(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--format=")) {
      const value = args[i].slice("--format=".length);
      if (value === "text" || value === "json") return value;
      console.error(`Unknown format: ${value}. Using "json".`);
      return "json";
    }
    if (args[i] === "--format" && i + 1 < args.length) {
      const value = args[i + 1];
      if (value === "text" || value === "json") return value;
      console.error(`Unknown format: ${value}. Using "json".`);
      return "json";
    }
  }
  return "json";
}

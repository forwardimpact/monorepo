import nodeFsSync from "node:fs";

import { resolveVersion } from "./version.js";

const HELP_TOKENS = new Set(["--help", "-h"]);
const VERSION_TOKENS = new Set(["--version", "-V"]);

/**
 * Strict first-token print-and-exit guard for long-running service binaries.
 *
 * Matches only `argv[0]`. When it is one of `--help`/`-h`/`--version`/`-V`, the
 * guard writes help or the version string and returns `true`; the caller skips
 * its server-start body and the event loop drains to exit 0 (no `process.exit`,
 * so piped stdout is never truncated). Any other first token — including a flag
 * in second position, `--port 8080`, or no arguments — returns `false` and the
 * caller proceeds to the untouched server-start path.
 *
 * @param {object} args
 * @param {string} args.name - binary name, e.g. "fit-svcgraph"
 * @param {string} args.description - one-line service summary for the help block
 * @param {URL|string} args.packageJsonUrl - `new URL("./package.json", import.meta.url)`
 * @param {string[]} args.argv - `process.argv.slice(2)`
 * @param {{ stdout: { write(s: string): unknown } }} [args.proc] - default: `process`; injected for tests
 * @param {object} [args.fsSync] - default: `node:fs`; wrapped as the `{ fsSync }` runtime bag `resolveVersion` expects
 * @returns {boolean} `true` when the token was handled, `false` otherwise
 */
export function serverFlagsShortCircuit({
  name,
  description,
  packageJsonUrl,
  argv,
  proc = process,
  fsSync = nodeFsSync,
}) {
  const token = argv[0];
  if (HELP_TOKENS.has(token)) {
    proc.stdout.write(
      `${name} — ${description}\n\n` +
        `Usage: ${name} [--help|-h] [--version|-V]\n\n` +
        "  --help, -h       Print this help and exit.\n" +
        "  --version, -V    Print the version and exit.\n\n" +
        "Any other invocation starts the service.\n",
    );
    return true;
  }
  if (VERSION_TOKENS.has(token)) {
    proc.stdout.write(
      `${resolveVersion({ packageJsonUrl, runtime: { fsSync } })}\n`,
    );
    return true;
  }
  return false;
}

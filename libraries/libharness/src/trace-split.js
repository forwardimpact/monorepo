/**
 * Shared trace-split implementation — the single owner of source-to-role
 * classification. Both the `gemba-trace split` command and the benchmark
 * runner drive this module, so exactly one split policy exists (the same
 * treatment the one-cost-path rule gives `sumTraceCost`).
 */

import { join } from "node:path";
import { createInterface } from "node:readline";

import { laneFilename } from "./trace-identity.js";

/** Valid source name pattern: lowercase letter, then lowercase alphanumeric or hyphen. */
const VALID_SOURCE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Sources whose name is itself a structural role; classified into the role
 * they represent. `judge` is structural so the judge lane classifies under
 * one rule — no current producer feeds judge-source envelopes through split
 * (the judge is its own session), so kata split output is unchanged.
 */
const STRUCTURAL_ROLES = new Set([
  "agent",
  "supervisor",
  "facilitator",
  "judge",
]);

/**
 * Split a combined `{source, seq, event}` NDJSON trace into per-source lane
 * files named by `laneFilename(caseId, source, role)`.
 *
 * Classification: sources in the structural-role set ("agent", "supervisor",
 * "facilitator", "judge") take their own name as role; any other valid source
 * name classifies as role "agent" with the source as participant. Skips
 * empty/malformed/non-envelope lines and orchestrator events; drops sources
 * failing `/^[a-z][a-z0-9-]*$/`. Lane files carry unwrapped event JSON, one
 * per line.
 *
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime -
 *   Ambient collaborators; streams via `runtime.fs`.
 * @param {string} inputPath - Combined NDJSON trace to split.
 * @param {object} opts
 * @param {string} opts.caseId - Case identity embedded in lane filenames.
 * @param {string} opts.outputDir - Directory the lane files are written to.
 * @returns {Promise<string[]>} Paths written, resolved against `outputDir`
 *   (absolute iff `outputDir` is absolute).
 */
export async function splitTrace(runtime, inputPath, { caseId, outputDir }) {
  const fs = runtime.fs;
  const rl = createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });
  const streams = new Map();
  const paths = [];
  for await (const line of rl) {
    const envelope = parseSplittableEnvelope(line);
    if (!envelope) continue;

    let stream = streams.get(envelope.source);
    if (!stream) {
      const role = STRUCTURAL_ROLES.has(envelope.source)
        ? envelope.source
        : "agent";
      const outPath = join(
        outputDir,
        laneFilename(caseId, envelope.source, role),
      );
      stream = fs.createWriteStream(outPath);
      streams.set(envelope.source, stream);
      paths.push(outPath);
    }
    stream.write(JSON.stringify(envelope.event) + "\n");
  }
  await Promise.all(
    [...streams.values()].map((s) => new Promise((r) => s.end(r))),
  );
  return paths;
}

/**
 * Parse one NDJSON line into a splittable envelope, or null when the line is
 * skipped: empty, malformed, non-envelope, orchestrator-source, or an invalid
 * source name.
 * @param {string} line
 * @returns {{source: string, event: object}|null}
 */
function parseSplittableEnvelope(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let envelope;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!envelope.event || typeof envelope.source !== "string") return null;
  if (envelope.source === "orchestrator") return null;
  if (!VALID_SOURCE_NAME.test(envelope.source)) return null;
  return envelope;
}

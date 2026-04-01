import { createWriteStream } from "fs";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createTeeWriter } from "../tee-writer.js";

/**
 * Tee command — stream text output to stdout while optionally saving the raw
 * NDJSON to a file. Processes stdin line-by-line for streaming output.
 *
 * Usage: fit-eval tee [output.ndjson] < trace.ndjson
 *
 * @param {string[]} args - Command arguments (optional output file path)
 */
export async function runTeeCommand(args) {
  const outputPath = args.find((a) => !a.startsWith("-")) ?? null;
  const fileStream = outputPath ? createWriteStream(outputPath) : null;

  // TeeWriter requires a fileStream; when no output file is specified,
  // use a PassThrough as a no-op sink (NDJSON is not saved).
  const sink = fileStream ?? new PassThrough();
  const tee = createTeeWriter({
    fileStream: sink,
    textStream: process.stdout,
    mode: "raw",
  });

  try {
    await pipeline(process.stdin, tee);
  } finally {
    if (fileStream) {
      await new Promise((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on("error", reject);
      });
    }
  }
}

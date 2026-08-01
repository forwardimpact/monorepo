import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isoTimestamp } from "@forwardimpact/libutil";
import { createTeeWriter } from "../tee-writer.js";

/**
 * Tee command — stream text output to stdout. Save the raw NDJSON to a file
 * when the caller gives an output path. The command reads stdin line by line
 * through the injected runtime. It re-delimits each record with a newline.
 * The TeeWriter's line splitter then sees the same record boundaries that the
 * raw byte stream produced.
 *
 * Usage: gemba-harness tee [output.ndjson] < trace.ndjson
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
export async function runTeeCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const outputPath = ctx.args.output ?? null;
  const fileStream = outputPath
    ? runtime.fs.createWriteStream(outputPath)
    : null;

  // TeeWriter requires a fileStream. When the caller gives no output file,
  // use a PassThrough as a no-op sink. The command then saves no NDJSON.
  const sink = fileStream ?? new PassThrough();
  const tee = createTeeWriter({
    fileStream: sink,
    textStream: runtime.proc.stdout,
    mode: "raw",
    now: () => isoTimestamp(runtime.clock.now()),
  });

  try {
    // `runtime.proc.stdin` yields newline-stripped lines. Re-append `\n` so
    // the TeeWriter's `_write` line splitter frames records exactly as it did
    // when the caller piped the raw byte stream into it.
    const lines = (async function* () {
      for await (const line of runtime.proc.stdin) yield `${line}\n`;
    })();
    await pipeline(lines, tee);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 1, error: error.message };
  } finally {
    if (fileStream) {
      await new Promise((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on("error", reject);
      });
    }
  }
}

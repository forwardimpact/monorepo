import { isoTimestamp } from "@forwardimpact/libutil";
import { createTraceCollector } from "@forwardimpact/libharness";

/**
 * Output command — process a complete NDJSON trace from stdin and write
 * formatted output to stdout.
 *
 * Usage: fit-eval output [--format=json|text] < trace.ndjson
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true}>}
 */
export async function runOutputCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  const format =
    values.format === "text" || values.format === "json"
      ? values.format
      : "json";
  const collector = createTraceCollector({
    now: () => isoTimestamp(runtime.clock.now()),
  });

  // `runtime.proc.stdin` is an AsyncIterable of UTF-8 lines (newline-split by
  // the runtime), so each yielded value is exactly one NDJSON record.
  for await (const line of runtime.proc.stdin) {
    collector.addLine(line);
  }

  if (format === "text") {
    runtime.proc.stdout.write(collector.toText() + "\n");
  } else {
    runtime.proc.stdout.write(JSON.stringify(collector.toJSON()) + "\n");
  }
  return { ok: true };
}

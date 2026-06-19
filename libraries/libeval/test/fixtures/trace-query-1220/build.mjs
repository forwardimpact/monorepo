/**
 * Retained baseline-fixture builder for the `fit-trace` query verbs.
 *
 * Captures the JSON output of each affected `fit-trace` verb's current query
 * code path over `test/fixtures/trace-1220.ndjson`, so the structural-
 * equivalence test (`test/trace-1220-equivalence.test.js`) binds the
 * `--format json` output against a frozen reference rather than re-deriving it
 * at runtime — the binding must be a fixed point, not the code grading itself.
 *
 * This is NOT a throwaway: re-run it after a legitimate trace-schema change to
 * regenerate the frozen reference, then `biome format --write` the output so
 * the committed JSON matches repo formatting (the equivalence test compares via
 * JSON.parse, so whitespace does not affect the binding):
 *
 *   node libraries/libeval/test/fixtures/trace-query-1220/build.mjs
 *   bunx biome format --write libraries/libeval/test/fixtures/trace-query-1220
 *
 * `head`/`tail` are captured at the post-change default `n = 10` so the
 * equivalence comparison (which invokes `--lines 10`) is apples-to-apples.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTraceCollector } from "../../../src/trace-collector.js";
import { createTraceQuery } from "../../../src/trace-query.js";
import { stripSignatures } from "../../../src/signature-filter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "trace-1220.ndjson");

function loadTrace(file) {
  const content = readFileSync(file, "utf8");
  const collector = createTraceCollector();
  for (const line of content.split("\n")) collector.addLine(line);
  return createTraceQuery(collector.toJSON());
}

const q = loadTrace(fixture);

// Each entry mirrors today's handler: run the method, strip thinking
// signatures (the default display filter), serialize with 2-space indent.
const verbs = {
  overview: () => q.overview(),
  head: () => q.head(10),
  tail: () => q.tail(10),
  tools: () => q.toolFrequency(),
  errors: () => q.errors(),
  reasoning: () => q.reasoning({}),
  init: () => q.init(),
  filter: () => q.filter({}),
  tool: () => q.tool("Bash"),
  turn: () => q.turn(3),
  batch: () => q.batch(0, 3),
  stats: () => q.stats(),
};

for (const [name, fn] of Object.entries(verbs)) {
  const payload = stripSignatures(fn());
  const out = join(here, `${name}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(`wrote ${out}\n`);
}

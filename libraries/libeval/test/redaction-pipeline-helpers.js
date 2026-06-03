import { Writable } from "node:stream";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/** Shared default runtime for the redaction-pipeline sibling suites. */
export const rt = createDefaultRuntime();

/**
 * JSON-stable guard: sentinels are printable ASCII without `"`, `\`, or
 * control chars so a substring scan over JSON-encoded bytes gives a sound
 * check (design § Test surfaces).
 * @param {string} s
 */
export function assertJsonStableSentinel(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: validating absence of control chars in test sentinels
  if (/[\x00-\x1f\x7f"\\]/.test(s)) {
    throw new Error(`sentinel is not JSON-stable: ${JSON.stringify(s)}`);
  }
}

/** Capture bytes written to a Writable into an array of strings. */
export function captureSink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    stream,
    get text() {
      return chunks.join("");
    },
  };
}

export const ANTH_SENT = "ANTHROPIC_PIPELINE_SENTINEL";
export const GH_SENT = "GH_TOKEN_PIPELINE_SENTINEL";
export const GITHUB_SENT = "GITHUB_TOKEN_PIPELINE_SENTINEL";

for (const s of [ANTH_SENT, GH_SENT, GITHUB_SENT]) {
  assertJsonStableSentinel(s);
}

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/** Shared default runtime for the redaction sibling suites. */
export const rt = createDefaultRuntime();

/**
 * Guard helper: sentinels must be JSON-stable (printable ASCII without `"`,
 * `\`, or control characters) so a substring scan over JSON-encoded bytes
 * gives a sound check. A non-stable sentinel would JSON-escape and pass
 * the substring check even when redaction missed.
 * @param {string} s
 */
export function assertJsonStableSentinel(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: validating absence of control chars in test sentinels
  if (/[\x00-\x1f\x7f"\\]/.test(s)) {
    throw new Error(`sentinel is not JSON-stable: ${JSON.stringify(s)}`);
  }
}

/**
 * Capture stderr writes from a callback. Restores the original write
 * regardless of throw outcome.
 * @param {() => void} fn
 */
export function captureStderr(fn) {
  const captured = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return captured.join("");
}

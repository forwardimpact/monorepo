/**
 * Strip `thinking.signature` base64 blobs from a JSON-serializable value.
 *
 * Applied at the CLI output boundary — the stored structured trace keeps
 * signatures intact (lossless storage), and the display filter drops them
 * by default because they dominate output without helping analysis.
 *
 * Recursively walks the input. For any object whose `type === "thinking"`,
 * the `signature` field is removed after copying. Signatures on objects of
 * any other type are preserved.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {*} A deep-copy with thinking signatures removed
 */
export function stripSignatures(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSignatures);

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = stripSignatures(val);
  }
  if (result.type === "thinking") {
    delete result.signature;
  }
  return result;
}

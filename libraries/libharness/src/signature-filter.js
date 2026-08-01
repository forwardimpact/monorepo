/**
 * Strip `thinking.signature` base64 blobs from a JSON-serializable value.
 *
 * The CLI applies this filter at the output boundary. The stored structured
 * trace keeps signatures intact (lossless storage). The display filter drops
 * them by default, because they dominate the output and do not help
 * analysis.
 *
 * This function walks the input recursively. For any object whose
 * `type === "thinking"`, it copies the object and then removes the
 * `signature` field. It keeps signatures on objects of any other type.
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

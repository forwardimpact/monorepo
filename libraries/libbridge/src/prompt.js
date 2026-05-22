/**
 * Build a facilitator prompt from the current message text and a rolling
 * conversation history. History is bounded to the last `maxExchanges`
 * exchanges (2x entries) and the total prompt size is capped at `charCap`
 * characters by dropping the oldest history entries until it fits.
 *
 * @param {string} text - The current user message
 * @param {Array<{role: "user"|"assistant", text: string}>} history - Prior
 *   exchanges in chronological order. Most recent last.
 * @param {object} [options]
 * @param {number} [options.maxExchanges] - Default 5 (10 entries kept)
 * @param {number} [options.charCap] - Default 4000 characters total
 * @returns {string}
 */
export function buildPrompt(
  text,
  history,
  { maxExchanges = 5, charCap = 4000 } = {},
) {
  const trimmed = history.slice(-maxExchanges * 2);
  while (trimmed.length > 0) {
    const block = trimmed
      .map((h) => `${h.role === "user" ? "User" : "Agent"}: ${h.text}`)
      .join("\n\n");
    const composed = `Prior conversation:\n${block}\n\nCurrent message: ${text}`;
    if (composed.length <= charCap) return composed;
    trimmed.shift();
  }
  return text;
}

/**
 * Append a message to a bounded history, dropping the oldest entries when
 * the cap is exceeded. Mutates `history` in place to match the legacy
 * msteams bridge behaviour preserved in services/msbridge.
 *
 * @param {Array<{role: "user"|"assistant", text: string}>} history
 * @param {{role: "user"|"assistant", text: string}} entry
 * @param {object} [options]
 * @param {number} [options.maxEntries] - Default 10
 */
export function appendHistory(history, entry, { maxEntries = 10 } = {}) {
  const record = { role: entry.role, text: entry.text };
  if (entry.author !== undefined) record.author = entry.author;
  history.push(record);
  while (history.length > maxEntries) history.shift();
}

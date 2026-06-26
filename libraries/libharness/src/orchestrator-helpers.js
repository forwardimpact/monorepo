/**
 * Render a drained batch of bus messages as tagged text lines so the
 * LLM can read its inbox at a glance. Asks and answers include the
 * `askId` in the tag (`[ask#42] facilitator: …`, `[answer#42] agent: …`)
 * so the addressee can quote it back via Answer's `askId` field.
 *
 * @param {Array<{from: string, text: string, kind?: string, askId?: number}>} messages
 * @returns {string}
 */
export function formatMessages(messages) {
  return messages.map(formatMessage).join("\n");
}

function formatMessage(m) {
  return `${tagFor(m)} ${m.from}: ${m.text}`;
}

function tagFor(m) {
  if (m.kind === "ask") return `[ask#${m.askId}]`;
  if (m.kind === "answer") return `[answer#${m.askId}]`;
  if (m.kind === "synthetic") return "[system]";
  return "[shared]";
}

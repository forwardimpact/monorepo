/**
 * Shared helpers for Facilitator and Supervisor orchestrators:
 * - `createAsyncQueue`  — simple promise-based queue used by the facilitator
 *                         event loop.
 * - `formatMessages`    — render a drained message batch as tagged lines.
 */

/** Create a promise-based async queue for serializing event delivery to the facilitator loop. */
export function createAsyncQueue() {
  const items = [];
  let waiter = null;
  let closed = false;
  return {
    enqueue(item) {
      items.push(item);
      if (waiter) {
        waiter();
        waiter = null;
      }
    },
    async dequeue() {
      if (items.length > 0) return items.shift();
      if (closed) return null;
      await new Promise((resolve) => {
        waiter = resolve;
      });
      return items.length > 0 ? items.shift() : null;
    },
    close() {
      closed = true;
      if (waiter) {
        waiter();
        waiter = null;
      }
    },
  };
}

/**
 * Render a drained batch of bus messages as tagged text lines.
 * @param {Array<{from: string, text: string, kind?: string, direct?: boolean}>} messages
 * @returns {string}
 */
export function formatMessages(messages) {
  return messages.map(formatMessage).join("\n");
}

function formatMessage(m) {
  return `${tagFor(m)} ${m.from}: ${m.text}`;
}

function tagFor(m) {
  if (m.kind === "ask") return "[ask]";
  if (m.kind === "answer") return "[answer]";
  if (m.kind === "announce") return "[shared]";
  if (m.kind === "synthetic") return "[system]";
  if (m.kind === "direct") return "[direct]";
  return m.direct ? "[direct]" : "[shared]";
}

/**
 * ReplyEmitter — POST reply/ack events to the callback URL as they
 * happen. Each emission is fire-and-forget so the message bus is never
 * blocked on network I/O.
 */
export class ReplyEmitter {
  #callbackUrl;
  #correlationId;
  #counter;

  /**
   * @param {object} deps
   * @param {string|null} deps.callbackUrl
   * @param {string|null} deps.correlationId
   * @param {import("./sequence-counter.js").SequenceCounter} deps.counter
   */
  constructor({ callbackUrl, correlationId, counter }) {
    this.#callbackUrl = callbackUrl;
    this.#correlationId = correlationId;
    this.#counter = counter;
  }

  /**
   * @param {object} event
   * @param {"reply"|"ack"} event.kind
   * @param {string} event.body
   * @param {string} event.agent
   * @returns {number} The assigned seq number
   */
  emit({ kind, body, agent }) {
    const seq = this.#counter.next();
    if (this.#callbackUrl) {
      fetch(this.#callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: this.#correlationId,
          kind,
          seq,
          body,
          agent,
        }),
      }).catch(() => {});
    }
    return seq;
  }
}

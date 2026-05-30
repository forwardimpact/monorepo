/**
 * InboxPoller — concurrent task that long-polls the bridge inbox for
 * injected messages and lands them on the lead's bus queue via
 * `messageBus.synthetic`.
 */
export class InboxPoller {
  #inboxUrl;
  #messageBus;
  #leadName;
  #signal;
  #lastSeq = 0;
  lastActedSeq = -1;

  /**
   * @param {object} deps
   * @param {string} deps.inboxUrl
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {string} deps.leadName
   * @param {AbortSignal} deps.signal
   */
  constructor({ inboxUrl, messageBus, leadName, signal }) {
    this.#inboxUrl = inboxUrl;
    this.#messageBus = messageBus;
    this.#leadName = leadName;
    this.#signal = signal;
  }

  /** Long-poll the inbox until the abort signal fires. */
  async run() {
    if (!this.#inboxUrl) return;
    while (!this.#signal.aborted) {
      try {
        const res = await fetch(`${this.#inboxUrl}?since=${this.#lastSeq}`, {
          signal: this.#signal,
        });
        if (!res.ok) {
          await delay(5_000, this.#signal);
          continue;
        }
        const { messages } = await res.json();
        for (const msg of messages) {
          this.#messageBus.synthetic(this.#leadName, msg.text);
          this.#lastSeq = Math.max(this.#lastSeq, msg.seq);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        await delay(5_000, this.#signal);
      }
    }
  }

  /** Record that the lead acted on all messages fetched so far. */
  markActed() {
    this.lastActedSeq = this.#lastSeq;
  }
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}

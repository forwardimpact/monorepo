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
  #clock;
  #lastSeq = 0;
  lastActedSeq = -1;

  /**
   * @param {object} deps
   * @param {string} deps.inboxUrl
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {string} deps.leadName
   * @param {AbortSignal} deps.signal
   * @param {import("@forwardimpact/libutil/runtime").Runtime} [deps.runtime] -
   *   Ambient collaborators; only `clock.setTimeout`/`clock.clearTimeout` are
   *   used for the inter-poll backoff. Falls back to the global timers when
   *   absent so existing callers keep working.
   */
  constructor({ inboxUrl, messageBus, leadName, signal, runtime }) {
    this.#inboxUrl = inboxUrl;
    this.#messageBus = messageBus;
    this.#leadName = leadName;
    this.#signal = signal;
    this.#clock = runtime?.clock ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h),
    };
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
          await this.#delay(5_000);
          continue;
        }
        const { messages } = await res.json();
        for (const msg of messages) {
          this.#messageBus.synthetic(this.#leadName, msg.text);
          this.#lastSeq = Math.max(this.#lastSeq, msg.seq);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        await this.#delay(5_000);
      }
    }
  }

  /** Record that the lead acted on all messages fetched so far. */
  markActed() {
    this.lastActedSeq = this.#lastSeq;
  }

  /**
   * Sleep for `ms`, resolving early when the abort signal fires.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise((resolve) => {
      const id = this.#clock.setTimeout(resolve, ms);
      this.#signal?.addEventListener(
        "abort",
        () => {
          this.#clock.clearTimeout(id);
          resolve();
        },
        { once: true },
      );
    });
  }
}

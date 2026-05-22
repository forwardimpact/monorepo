import { ProgressTicker } from "./progress-ticker.js";

const DEFAULT_INTERVAL_MS = 25_000;

export const DEFAULT_TYPING_VERBS = Object.freeze([
  "Moonwalking",
  "Unravelling",
  "Tempering",
  "Crafting",
  "Simmering",
  "Percolating",
  "Decoding",
]);

/**
 * Channel-agnostic acknowledgement lifecycle. The consumer provides a
 * reaction adapter that knows how to add and remove the channel's
 * "received" reaction. Optionally, the consumer may pass a typing adapter
 * — its only job is to deliver a single string to the channel.
 * Acknowledgement owns *when* to react, *which* typing verb to use, and
 * *how often* to send one.
 *
 *   reactionAdapter.add(target) -> reactionId | null
 *   reactionAdapter.remove(reactionId, target) -> void
 *   typingAdapter.send(target, text) -> void           // optional
 *
 * `start(token, target)` adds the reaction immediately. If a typing
 * adapter was supplied, it also begins posting a random typing verb
 * every `intervalMs` (default 25s) — e.g. `"Crafting..."`,
 * `"Moonwalking..."`. `finish(token, target)` stops the typing ticker
 * and removes the reaction. Adapter errors are logged through the
 * optional logger but never thrown.
 */
export class Acknowledgement {
  #reactionAdapter;
  #typingAdapter;
  #typingVerbs;
  #ticker;
  #logger;
  #state = new Map();

  /**
   * @param {object} options
   * @param {{add: Function, remove: Function}} options.reactionAdapter
   * @param {{send: Function}} [options.typingAdapter]
   * @param {number} [options.intervalMs] - Typing cadence (default 25s)
   * @param {readonly string[]} [options.typingVerbs] - Override the verb pool
   * @param {import("./progress-ticker.js").ProgressTicker} [options.progressTicker]
   * @param {{warn?: Function, error?: Function}} [options.logger]
   */
  constructor({
    reactionAdapter,
    typingAdapter,
    intervalMs,
    typingVerbs,
    progressTicker,
    logger,
  } = {}) {
    if (
      !reactionAdapter ||
      typeof reactionAdapter.add !== "function" ||
      typeof reactionAdapter.remove !== "function"
    ) {
      throw new Error("reactionAdapter must implement add() and remove()");
    }
    if (typingAdapter && typeof typingAdapter.send !== "function") {
      throw new Error("typingAdapter must implement send()");
    }
    if (typingVerbs !== undefined) {
      if (!Array.isArray(typingVerbs) || typingVerbs.length === 0) {
        throw new Error("typingVerbs must be a non-empty array");
      }
    }
    this.#reactionAdapter = reactionAdapter;
    this.#typingAdapter = typingAdapter ?? null;
    this.#typingVerbs = typingVerbs ?? DEFAULT_TYPING_VERBS;
    this.#ticker =
      progressTicker ??
      new ProgressTicker({ intervalMs: intervalMs ?? DEFAULT_INTERVAL_MS });
    this.#logger = logger ?? null;
  }

  /**
   * Begin acknowledging the dispatch identified by `token`. Idempotent on
   * the same token — a second start is a no-op.
   * @param {string} token
   * @param {unknown} target
   */
  async start(token, target) {
    if (this.#state.has(token)) return;
    let reactionId = null;
    try {
      reactionId = (await this.#reactionAdapter.add(target)) ?? null;
    } catch (err) {
      this.#logger?.warn?.("acknowledgement.add", err);
    }
    this.#state.set(token, { reactionId, target });
    if (this.#typingAdapter) this.#startTyping(token, target);
  }

  /**
   * Stop acknowledging the dispatch identified by `token`. No-op if the
   * token has no active acknowledgement.
   * @param {string} token
   * @param {unknown} [target]
   */
  async finish(token, target) {
    const entry = this.#state.get(token);
    if (!entry) return;
    this.#ticker.stop(token);
    this.#state.delete(token);
    try {
      await this.#reactionAdapter.remove(
        entry.reactionId,
        target ?? entry.target,
      );
    } catch (err) {
      this.#logger?.warn?.("acknowledgement.remove", err);
    }
  }

  /** @param {string} token @returns {boolean} */
  pending(token) {
    return this.#state.has(token);
  }

  #startTyping(token, target) {
    const adapter = this.#typingAdapter;
    const verbs = this.#typingVerbs;
    const logger = this.#logger;
    this.#ticker.start(token, async () => {
      const verb = verbs[Math.floor(Math.random() * verbs.length)];
      try {
        await adapter.send(target, `${verb}...`);
      } catch (err) {
        logger?.warn?.("acknowledgement.typing", err);
        throw err;
      }
    });
  }
}

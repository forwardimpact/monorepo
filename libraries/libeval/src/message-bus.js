/**
 * MessageBus — in-memory per-participant message queues.
 *
 * Four message kinds, each pushed onto the addressee's queue:
 *
 * - `ask(from, to, text, askId)` — direct question; the toolkit owns the
 *   pending-ask state separately. Fan-out (broadcast Ask) happens at the
 *   handler level by calling `ask()` once per addressee.
 * - `answer(from, to, text, askId)` — direct reply to the original asker.
 *   The orchestrator may inject synthetic answers (`from === "@orchestrator"`)
 *   when an Ask times out.
 * - `announce(from, text)` — broadcast, no reply expected; lands on every
 *   participant's queue except the sender's.
 * - `synthetic(to, text)` — orchestrator-only reminder injection.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

/** In-memory per-participant message queues. */
export class MessageBus {
  /**
   * @param {object} deps
   * @param {string[]} deps.participants - Canonical participant names.
   */
  constructor({ participants }) {
    this.queues = new Map();
    this.waiters = new Map();
    for (const name of participants) {
      this.queues.set(name, []);
      this.waiters.set(name, null);
    }
  }

  /** Send a question to one participant. */
  ask(from, to, text, askId) {
    this.#assertParticipant(from);
    this.#assertParticipant(to);
    this.queues.get(to).push({ from, text, kind: "ask", askId });
    this.#resolveWaiter(to);
  }

  /**
   * Reply to a pending ask. `from === "@orchestrator"` is allowed for
   * synthetic null answers — the orchestrator is not a real participant
   * but it routes through the bus.
   */
  answer(from, to, text, askId) {
    this.#assertParticipant(to);
    if (from !== "@orchestrator") this.#assertParticipant(from);
    this.queues.get(to).push({ from, text, kind: "answer", askId });
    this.#resolveWaiter(to);
  }

  /** Broadcast a message to every participant except the sender. */
  announce(from, text) {
    this.#assertParticipant(from);
    const msg = { from, text, kind: "announce" };
    for (const [name, queue] of this.queues) {
      if (name === from) continue;
      queue.push(msg);
      this.#resolveWaiter(name);
    }
  }

  /** Inject an orchestrator-originated reminder onto one participant's queue. */
  synthetic(to, text) {
    this.#assertParticipant(to);
    this.queues
      .get(to)
      .push({ from: "@orchestrator", text, kind: "synthetic" });
    this.#resolveWaiter(to);
  }

  /** Check whether a participant has pending messages without draining them. */
  hasPending(participant) {
    this.#assertParticipant(participant);
    return this.queues.get(participant).length > 0;
  }

  /** Return and clear pending messages for a participant. */
  drain(participant) {
    this.#assertParticipant(participant);
    return this.queues.get(participant).splice(0);
  }

  /**
   * Return a Promise that resolves when at least one message is pending.
   * Resolves immediately if messages are already queued.
   */
  waitForMessages(participant) {
    this.#assertParticipant(participant);
    if (this.queues.get(participant).length > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.set(participant, resolve);
    });
  }

  #assertParticipant(name) {
    if (!this.queues.has(name)) {
      throw new Error(`Unknown participant: ${name}`);
    }
  }

  #resolveWaiter(name) {
    const waiter = this.waiters.get(name);
    if (waiter) {
      this.waiters.set(name, null);
      waiter();
    }
  }
}

/** Factory function. */
export function createMessageBus(deps) {
  return new MessageBus(deps);
}

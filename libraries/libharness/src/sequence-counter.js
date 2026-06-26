/**
 * SequenceCounter — global monotonic counter shared across all participants
 * in a session. Single-threaded JS means no synchronization needed.
 */
/** Monotonic counter that assigns globally ordered sequence numbers within a session. */
export class SequenceCounter {
  /** Initialize the counter at zero. */
  constructor() {
    this.value = 0;
  }

  /** Return the current value and advance the counter by one. */
  next() {
    return this.value++;
  }
}

/** Create a new SequenceCounter starting at zero. */
export function createSequenceCounter() {
  return new SequenceCounter();
}

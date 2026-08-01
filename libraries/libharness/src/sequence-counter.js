/**
 * SequenceCounter — global monotonic counter. All participants in a session
 * share one counter. Single-threaded JS means the counter needs no
 * synchronization.
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

/** Create a new SequenceCounter that starts at zero. */
export function createSequenceCounter() {
  return new SequenceCounter();
}

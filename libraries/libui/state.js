/**
 * Generic state store with pub/sub
 */

/**
 * @template T
 * @typedef {Object} Store
 * @property {() => T} getState - Get the current state
 * @property {(path: string) => *} getStatePath - Get a value at a dot-notation path
 * @property {(path: string, value: *) => void} updateState - Update a value at a dot-notation path
 * @property {(fn: (state: T) => void) => () => void} subscribe - Subscribe to state changes
 */

/**
 * Create a state store
 * @template T
 * @param {T} initialState - Initial state object
 * @returns {Store<T>}
 */
export function createStore(initialState) {
  const state = initialState;

  /** @type {Set<Function>} */
  const listeners = new Set();

  function notifyListeners() {
    listeners.forEach((listener) => listener(state));
  }

  return {
    /**
     * Get the current state
     * @returns {T}
     */
    getState() {
      return state;
    },

    /**
     * Get a specific path from state
     * @param {string} path - Dot-notation path (e.g., 'data.skills')
     * @returns {*}
     */
    getStatePath(path) {
      return path.split(".").reduce((obj, key) => obj?.[key], state);
    },

    /**
     * Update state at a specific path
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     */
    updateState(path, value) {
      const keys = path.split(".");
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => obj[key], state);
      target[lastKey] = value;
      notifyListeners();
    },

    /**
     * Subscribe to state changes
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

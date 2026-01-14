/**
 * Reactive state utilities for local component state
 */

/**
 * @template T
 * @typedef {Object} Reactive
 * @property {() => T} get - Get current value
 * @property {(value: T) => void} set - Set new value
 * @property {(fn: (prev: T) => T) => void} update - Update value with function
 * @property {(fn: (value: T) => void) => () => void} subscribe - Subscribe to changes
 */

/**
 * Create a reactive state container
 * @template T
 * @param {T} initial - Initial value
 * @returns {Reactive<T>}
 */
export function createReactive(initial) {
  let state = initial;
  const subscribers = new Set();

  return {
    get: () => state,

    set: (next) => {
      state = next;
      subscribers.forEach((fn) => fn(state));
    },

    update: (fn) => {
      state = fn(state);
      subscribers.forEach((sub) => sub(state));
    },

    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

/**
 * Create a computed value that updates when dependencies change
 * @template T
 * @param {() => T} compute - Computation function
 * @param {Reactive<*>[]} deps - Dependencies
 * @returns {Reactive<T>}
 */
export function createComputed(compute, deps) {
  const computed = createReactive(compute());

  deps.forEach((dep) => {
    dep.subscribe(() => {
      computed.set(compute());
    });
  });

  return computed;
}

/**
 * Bind a reactive value to an element attribute
 * @template T
 * @param {Reactive<T>} reactive - Reactive state
 * @param {HTMLElement} element - Element to bind
 * @param {string} attribute - Attribute name
 * @param {(value: T) => *} [transform] - Transform function
 */
export function bind(reactive, element, attribute, transform = (v) => v) {
  const update = (value) => {
    element[attribute] = transform(value);
  };
  update(reactive.get());
  reactive.subscribe(update);
}

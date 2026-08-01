/**
 * @typedef {Object} RouteDescriptor
 * @property {string} pattern
 * @property {(ctx: import('./invocation-context.js').InvocationContext, opts: { vocabularyBase?: string }) => void} page
 * @property {((ctx: import('./invocation-context.js').InvocationContext) => string)=} cli
 * @property {((ctx: import('./invocation-context.js').InvocationContext, vocabularyBase: string) => string)=} graph
 */

/**
 * Build a frozen route descriptor. It binds a URL pattern to its page, CLI,
 * and graph channels.
 * @param {{ pattern: string, page: Function, cli?: Function, graph?: Function }} spec
 * @returns {RouteDescriptor}
 */
export function defineRoute({ pattern, page, cli, graph }) {
  if (typeof pattern !== "string") throw new TypeError("pattern: string");
  if (typeof page !== "function") throw new TypeError("page: function");
  return Object.freeze({ pattern, page, cli, graph });
}

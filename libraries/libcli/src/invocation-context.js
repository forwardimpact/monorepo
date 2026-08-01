/**
 * @typedef {Object} InvocationContext
 *
 * The shape libui and libcli both produce from their native inputs.
 * Handlers consume the context and return a view. Surface-specific
 * formatters render the view. The context carries no information about
 * which surface produced it. Surface dispatch happens one level above the
 * handler.
 *
 * Invariants:
 * - No surface affordances — no DOM nodes, streams, Request/Response, or
 *   surface tag. Anything that exists on only one surface stays out.
 * - Uniform value shapes — args values are strings. Options values are one
 *   of string, boolean true, or string[]. No nulls, no numbers.
 * - Frozen at all levels — the producer calls Object.freeze on the context,
 *   args, options, and any array inside options.
 *
 * @property {Object} data
 *   Host's data dependencies, opaque to libui and libcli. The product owns
 *   the shape. Anything a handler needs that is not a positional or named
 *   argument lives here. This includes surface-specific runtime dependencies
 *   the host folds in before invocation. The handler treats data as
 *   immutable input.
 *
 * @property {Readonly<Object<string, string>>} args
 *   Named positional arguments. On the web side they are route-pattern
 *   parameters keyed by their name. On the CLI side they are the names of
 *   the subcommand's declared positionals, mapped to their argv values.
 *   Values are always strings. Consumers parse them if they need other types.
 *
 * @property {Readonly<Object<string, string | boolean | string[]>>} options
 *   Named non-positional arguments. On the web side they are the query
 *   string in the URL hash, parsed once. On the CLI side they are parsed CLI
 *   flags. A value is one of: a string, the boolean true, or an array of
 *   strings. The boolean true marks a presence-only flag or an empty-valued
 *   query parameter. You get an array of strings when the same key appears
 *   more than once. Absent options are not present in the object. The
 *   expression 'foo' in ctx.options is the membership test.
 *
 * @property {Readonly<Object>} deps
 *   Host-injected ambient collaborators (the `runtime` bag and typed
 *   clients). The handler treats deps as immutable input.
 *   Distinct from `data` (host-loaded domain values). Defaults to
 *   `undefined` for hosts that do not inject collaborators.
 */

/**
 * Deep-freeze an invocation context so handlers may assume immutability.
 * @param {{ data: Object, args: Object<string,string>, options: Object<string,string|boolean|string[]>, deps?: Object }} raw
 * @returns {InvocationContext}
 */
export function freezeInvocationContext({ data, args, options, deps }) {
  for (const v of Object.values(options)) {
    if (Array.isArray(v)) Object.freeze(v);
  }
  return Object.freeze({
    data,
    args: Object.freeze({ ...args }),
    options: Object.freeze({ ...options }),
    deps: deps === undefined ? undefined : Object.freeze(deps),
  });
}

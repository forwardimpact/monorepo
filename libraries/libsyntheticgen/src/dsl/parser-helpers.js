/**
 * DSL Parser — shared dispatch helpers for block-level parsers.
 *
 * Both `parser-blocks.js` and `parser-standard.js` implement the same
 * loop-until-RBRACE-then-dispatch pattern. This module provides a single
 * unified helper that serves both use cases.
 *
 * @module libterrain/dsl/parser-helpers
 */

/**
 * Create shared dispatch helpers bound to token helpers.
 * @param {{ peek: () => any, advance: () => any, expect: (type: string, value?: string) => any }} helpers
 * @returns {{ consumeFields: Function }}
 */
export function createDispatchHelpers(helpers) {
  const { peek, advance, expect, parseArray } = helpers;

  /**
   * Consume brace-delimited keyword fields with a dispatch map.
   *
   * The loop reads tokens until RBRACE. It dispatches each keyword
   * through the handler map. It throws on any keyword that the map does
   * not hold.
   *
   * @param {Record<string, (kw: any) => void>} handlers — dispatch table
   * @param {string} blockName — label for error messages
   * @param {{ target?: object, consumeRBrace?: boolean }} [options]
   * @param {object} [options.target] — when provided, created internally
   *   and returned. Each handler receives the target as its first
   *   argument. When omitted, handlers receive the keyword token (legacy
   *   mode).
   * @param {boolean} [options.consumeRBrace] — when true, the function
   *   consumes the trailing RBRACE token before it returns. Defaults to
   *   false.
   * @returns {object|undefined} The target object when `options.target` is
   *   provided. Otherwise undefined.
   */
  function consumeFields(handlers, blockName, options) {
    const target = options?.target;
    const consumeRBrace = options?.consumeRBrace ?? false;

    while (peek().type !== "RBRACE") {
      const kw = advance();
      const handler = handlers[kw.value];
      if (handler) {
        handler(target ?? kw);
      } else {
        throw new Error(
          `Unexpected '${kw.value}' in ${blockName} at line ${kw.line}`,
        );
      }
    }

    if (consumeRBrace) {
      expect("RBRACE");
    }

    return target;
  }

  function parseMappedArrays(blockName) {
    expect("LBRACE");
    const map = {};
    while (peek().type !== "RBRACE") {
      const key = advance();
      if (
        key.type !== "DOTTED_IDENT" &&
        key.type !== "IDENT" &&
        key.type !== "KEYWORD"
      ) {
        throw new Error(
          `Expected identifier in ${blockName} at line ${key.line}, got ${key.type}`,
        );
      }
      map[key.value] = parseArray();
    }
    expect("RBRACE");
    return map;
  }

  return { consumeFields, parseMappedArrays };
}

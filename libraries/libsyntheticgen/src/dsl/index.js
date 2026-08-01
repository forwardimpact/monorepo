import { tokenize } from "./tokenizer.js";
import { parse } from "./parser.js";

/**
 * DSL parser that tokenizes the source and then parses the tokens.
 */
export class DslParser {
  /**
   * @param {Function} tokenizeFn - Tokenizer function
   * @param {Function} parseFn - Parser function
   */
  constructor(tokenizeFn, parseFn) {
    if (!tokenizeFn) throw new Error("tokenizeFn is required");
    if (!parseFn) throw new Error("parseFn is required");
    this.tokenizeFn = tokenizeFn;
    this.parseFn = parseFn;
  }

  /**
   * Parse terrain DSL source into an AST.
   * @param {string} source - DSL source text
   * @returns {import('./parser.js').TerrainAST}
   */
  parse(source) {
    const tokens = this.tokenizeFn(source);
    return this.parseFn(tokens);
  }
}

/**
 * Create a DslParser with the built-in tokenizer and parser.
 * @returns {DslParser}
 */
export function createDslParser() {
  return new DslParser(tokenize, parse);
}

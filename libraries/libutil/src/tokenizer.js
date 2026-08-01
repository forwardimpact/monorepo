/**
 * Simple tokenizer class that gives API compatibility with js-tiktoken
 * It uses basic approximation logic to count tokens
 */
export class Tokenizer {
  /**
   * Creates a new Tokenizer instance
   * @param {object} _ranks - Rank data (unused in the simple implementation)
   */
  constructor(_ranks) {
    // This simple implementation ignores the ranks parameter
  }

  /**
   * Encodes text into tokens with simple approximation
   * @param {string} text - Text to encode
   * @returns {number[]} Array of token IDs (approximated)
   */
  encode(text) {
    if (typeof text !== "string") {
      return [];
    }

    if (text.length === 0) {
      return [];
    }

    // Simple approximation logic:
    // 1. Split on whitespace and punctuation
    // 2. Count characters in a way that approximates GPT tokenization
    // 3. Return an array whose length approximates the actual token count

    // Remove extra whitespace and normalize
    const normalized = text.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
      return [];
    }

    // Simple heuristic to count tokens:
    // - The average English word is ~4 characters = 1 token
    // - Punctuation and special chars often = 1 token each
    // - Numbers and code can be more dense

    let tokenCount = 0;

    // Count words (sequences of letters/numbers)
    const words = normalized.match(/\b\w+\b/g) || [];
    for (const word of words) {
      // Short words (1-4 chars) = 1 token
      // Longer words = roughly chars/4 tokens
      if (word.length <= 4) {
        tokenCount += 1;
      } else {
        tokenCount += Math.ceil(word.length / 4);
      }
    }

    // Count punctuation and special characters
    const punctuation = normalized.match(/[^\w\s]/g) || [];
    tokenCount += punctuation.length;

    // Count whitespace as minimal tokens (spaces between words)
    const spaces = normalized.match(/\s/g) || [];
    tokenCount += Math.ceil(spaces.length / 2);

    // Make sure non-empty text has a minimum of 1 token
    tokenCount = Math.max(1, tokenCount);

    // Return an array with dummy token IDs
    // The actual values do not matter because callers read only .length
    return new Array(tokenCount).fill(0).map((_, i) => i);
  }

  /**
   * Decodes tokens back to text (not implemented, not used in the codebase)
   * @param {number[]} _tokens - Token IDs to decode
   * @throws {Error} Always throws, because it is not implemented
   */
  decode(_tokens) {
    throw new Error("decode() not implemented in Tokenizer");
  }
}

/**
 * Dummy ranks object for compatibility
 * The simple implementation does not use it. API compatibility needs it
 */
export const ranks = {};

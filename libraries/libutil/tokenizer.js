/**
 * Simple tokenizer class that provides API compatibility with js-tiktoken
 * Uses basic approximation logic for token counting
 */
export class Tokenizer {
  /**
   * Creates a new Tokenizer instance
   * @param {object} _ranks - Ranking data (unused in simple implementation)
   */
  constructor(_ranks) {
    // Ranks parameter is ignored in this simple implementation
  }

  /**
   * Encodes text into tokens using simple approximation
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
    // 3. Return array with length approximating actual token count

    // Remove extra whitespace and normalize
    const normalized = text.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
      return [];
    }

    // Simple heuristic for token counting:
    // - Average English word is ~4 characters = 1 token
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

    // Ensure minimum of 1 token for non-empty text
    tokenCount = Math.max(1, tokenCount);

    // Return array with dummy token IDs
    // The actual values don't matter since only .length is used
    return new Array(tokenCount).fill(0).map((_, i) => i);
  }

  /**
   * Decodes tokens back to text (not implemented - not used in codebase)
   * @param {number[]} _tokens - Token IDs to decode
   * @throws {Error} Always throws - not implemented
   */
  decode(_tokens) {
    throw new Error("decode() not implemented in Tokenizer");
  }
}

/**
 * Dummy ranks object for compatibility
 * Not used in the simple implementation but needed for API compatibility
 */
export const ranks = {};

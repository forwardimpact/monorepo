/**
 * Retry class for handling transient errors with exponential backoff
 */
export class Retry {
  #retries;
  #delay;

  /**
   * Creates a new Retry instance
   * @param {object} [config] - Optional configuration object
   * @param {number} [config.retries] - Maximum number of retry attempts (default: 10)
   * @param {number} [config.delay] - Initial delay in milliseconds (default: 1000)
   */
  constructor(config = {}) {
    this.#retries = config.retries ?? 10;
    this.#delay = config.delay ?? 1000;
  }

  /**
   * Checks if an HTTP status code or error should trigger a retry
   * @param {number} status - HTTP status code
   * @returns {boolean} True if the status should be retried
   * @private
   */
  #isRetryableStatus(status) {
    // Retry on rate limits, transient server errors, and client timeouts
    return (
      status === 429 ||
      status === 499 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  /**
   * Checks if an error is a network error that should trigger a retry
   * @param {Error} error - Error object
   * @returns {boolean} True if the error should be retried
   * @private
   */
  #isRetryableError(error) {
    const message = error.message.toLowerCase();

    // Check for HTTP status codes in error messages (e.g., "HTTP 499: status code 499")
    const httpStatusMatch = message.match(/http (\d{3})/);
    if (httpStatusMatch) {
      const statusCode = parseInt(httpStatusMatch[1], 10);
      if (this.#isRetryableStatus(statusCode)) {
        return true;
      }
    }

    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("unavailable") ||
      message.includes("fetch failed") ||
      message.includes("unexpected eof")
    );
  }

  /**
   * Executes a function with exponential backoff retry logic for transient errors
   * @param {() => Promise<Response>} requestFn - Function that returns a fetch promise
   * @returns {Promise<Response>} Response from successful request
   * @throws {Error} When all retry attempts are exhausted
   */
  async execute(requestFn) {
    let lastError;

    for (let attempt = 0; attempt <= this.#retries; attempt++) {
      try {
        const response = await requestFn();

        // Check if we should retry based on status code
        if (
          response?.status &&
          this.#isRetryableStatus(response.status) &&
          attempt < this.#retries
        ) {
          // Add jitter to exponential backoff to avoid thundering herd
          const exponentialDelay = this.#delay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * exponentialDelay;
          const wait = exponentialDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        // Check if this is a retryable network error
        if (this.#isRetryableError(error) && attempt < this.#retries) {
          const exponentialDelay = this.#delay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * exponentialDelay;
          const wait = exponentialDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }

        // Non-retryable error or out of retries
        throw error;
      }
    }

    // This should never be reached, but if it is, throw the last error
    throw lastError || new Error("Retries exhausted without a valid response");
  }
}

/**
 * Factory function to create a Retry instance with optional configuration
 * @param {object} [config] - Optional configuration object
 * @param {number} [config.retries] - Maximum number of retry attempts
 * @param {number} [config.delay] - Initial delay in milliseconds
 * @returns {Retry} Configured Retry instance
 */
export function createRetry(config) {
  return new Retry(config);
}

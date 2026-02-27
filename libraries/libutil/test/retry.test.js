import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Module under test
import { Retry } from "../retry.js";

describe("Retry", () => {
  let retry;

  beforeEach(() => {
    // Use very short delay for testing to speed up retry tests
    retry = new Retry({ delay: 1 });
  });

  test("creates retry instance with default config", () => {
    const defaultRetry = new Retry();
    assert.ok(defaultRetry instanceof Retry);
  });

  test("creates retry instance with custom config", () => {
    const customRetry = new Retry({ retries: 5, delay: 500 });
    assert.ok(customRetry instanceof Retry);
  });

  test("retry mechanism works with exhausted retries on 429", async () => {
    const retryResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    };

    const mockFetch = mock.fn(() => Promise.resolve(retryResponse));

    const response = await retry.execute(mockFetch);

    // Should exhaust all retries and return the 429 response
    assert.strictEqual(mockFetch.mock.callCount(), 11); // Initial + 10 retries
    assert.strictEqual(response.status, 429);
  });

  test("retries on 502 Bad Gateway errors", async () => {
    const retryResponse = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    };
    const successResponse = {
      ok: true,
      status: 200,
      json: mock.fn(() => Promise.resolve({ data: "success" })),
    };

    let callCount = 0;
    const mockFetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(retryResponse);
      }
      return Promise.resolve(successResponse);
    });

    const result = await retry.execute(mockFetch);

    // Should retry once and succeed
    assert(mockFetch.mock.callCount() >= 2);
    assert.strictEqual(result.ok, true);
  });

  test("retries on 503 Service Unavailable errors", async () => {
    const retryResponse = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    };
    const successResponse = {
      ok: true,
      status: 200,
      json: mock.fn(() => Promise.resolve({ data: "success" })),
    };

    let callCount = 0;
    const mockFetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(retryResponse);
      }
      return Promise.resolve(successResponse);
    });

    const result = await retry.execute(mockFetch);

    // Should retry once and succeed
    assert(mockFetch.mock.callCount() >= 2);
    assert.strictEqual(result.ok, true);
  });

  test("retries on 504 Gateway Timeout errors", async () => {
    const retryResponse = {
      ok: false,
      status: 504,
      statusText: "Gateway Timeout",
    };
    const successResponse = {
      ok: true,
      status: 200,
      json: mock.fn(() => Promise.resolve({ data: "success" })),
    };

    let callCount = 0;
    const mockFetch = mock.fn(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve(retryResponse);
      }
      return Promise.resolve(successResponse);
    });

    const result = await retry.execute(mockFetch);

    // Should retry twice and succeed
    assert(mockFetch.mock.callCount() >= 3);
    assert.strictEqual(result.ok, true);
  });

  test("retries on network errors", async () => {
    const successResponse = {
      ok: true,
      status: 200,
      json: mock.fn(() => Promise.resolve({ data: "success" })),
    };

    let callCount = 0;
    const mockFetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network error: Connection refused"));
      }
      return Promise.resolve(successResponse);
    });

    const result = await retry.execute(mockFetch);

    // Should retry once and succeed
    assert(mockFetch.mock.callCount() >= 2);
    assert.strictEqual(result.ok, true);
  });

  test("non-retryable errors do not trigger retries", async () => {
    const errorResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
    };

    const mockFetch = mock.fn(() => Promise.resolve(errorResponse));

    const response = await retry.execute(mockFetch);

    // Should only make one call for non-retryable errors
    assert.strictEqual(mockFetch.mock.callCount(), 1);
    assert.strictEqual(response.status, 400);
  });

  test("500 Internal Server Error triggers retries", async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };

    const mockFetch = mock.fn(() => Promise.resolve(errorResponse));

    const response = await retry.execute(mockFetch);

    // Should retry for 500 errors (retries + 1 initial attempt = 11 calls)
    assert.strictEqual(mockFetch.mock.callCount(), 11);
    assert.strictEqual(response.status, 500);
  });

  test("executes successfully without validation function", async () => {
    const successResponse = {
      ok: true,
      status: 200,
      json: mock.fn(() => Promise.resolve({ data: "success" })),
    };

    const mockFetch = mock.fn(() => Promise.resolve(successResponse));

    const result = await retry.execute(mockFetch);

    assert.strictEqual(mockFetch.mock.callCount(), 1);
    assert.strictEqual(result.ok, true);
  });
});

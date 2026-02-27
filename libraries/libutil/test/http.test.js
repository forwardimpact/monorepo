import { test, describe } from "node:test";
import assert from "node:assert";
import { parseJsonBody } from "../http.js";

/**
 * Creates a mock HTTP request object with event emitter behavior
 * @param {object} options - Request options
 * @returns {object} Mock request object
 */
function createMockRequest(options = {}) {
  const { body = {} } = options;
  const bodyStr = JSON.stringify(body);
  let dataCallback;
  let endCallback;
  let errorCallback;

  return {
    on: (event, callback) => {
      if (event === "data") dataCallback = callback;
      if (event === "end") endCallback = callback;
      if (event === "error") errorCallback = callback;
    },
    simulateBody: () => {
      if (dataCallback) dataCallback(bodyStr);
      if (endCallback) endCallback();
    },
    simulateError: (err) => {
      if (errorCallback) errorCallback(err);
    },
  };
}

describe("parseJsonBody", () => {
  test("parses valid JSON body", async () => {
    const req = createMockRequest({
      body: { message: "Hello", correlationId: "123" },
    });

    const parsePromise = parseJsonBody(req);
    req.simulateBody();
    const result = await parsePromise;

    assert.deepStrictEqual(result, { message: "Hello", correlationId: "123" });
  });

  test("returns empty object for invalid JSON", async () => {
    const req = createMockRequest({ body: {} });
    let dataCallback;
    let endCallback;

    req.on = (event, callback) => {
      if (event === "data") dataCallback = callback;
      if (event === "end") endCallback = callback;
    };

    const parsePromise = parseJsonBody(req);
    dataCallback("not valid json {{{");
    endCallback();
    const result = await parsePromise;

    assert.deepStrictEqual(result, {});
  });

  test("rejects on request error", async () => {
    const req = createMockRequest({ body: {} });
    const testError = new Error("Connection reset");

    const parsePromise = parseJsonBody(req);
    req.simulateError(testError);

    await assert.rejects(() => parsePromise, {
      message: "Connection reset",
    });
  });

  test("handles empty body", async () => {
    const req = createMockRequest({ body: {} });
    let dataCallback;
    let endCallback;

    req.on = (event, callback) => {
      if (event === "data") dataCallback = callback;
      if (event === "end") endCallback = callback;
    };

    const parsePromise = parseJsonBody(req);
    dataCallback("");
    endCallback();
    const result = await parsePromise;

    assert.deepStrictEqual(result, {});
  });
});

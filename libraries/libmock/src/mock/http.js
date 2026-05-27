/**
 * Creates a mock HTTP request with event emitter behavior
 * @param {object} options - Request options
 * @returns {object} Mock request
 */
export function createMockRequest(options = {}) {
  const { method = "GET", url = "/", body = {}, headers = {} } = options;

  const bodyStr = JSON.stringify(body);
  let dataCallback;
  let endCallback;
  let errorCallback;

  return {
    method,
    url,
    headers,
    on(event, callback) {
      if (event === "data") dataCallback = callback;
      if (event === "end") endCallback = callback;
      if (event === "error") errorCallback = callback;
    },
    simulateBody() {
      if (dataCallback) dataCallback(bodyStr);
      if (endCallback) endCallback();
    },
    simulateError(err) {
      if (errorCallback) errorCallback(err);
    },
  };
}

/**
 * Creates a mock HTTP response with tracking
 * @returns {object} Mock response
 */
export function createMockResponse() {
  const response = {
    headersSent: false,
    statusCode: null,
    headers: {},
    body: "",
    chunks: [],
    writeHead(status, headers) {
      response.statusCode = status;
      response.headers = headers || {};
      response.headersSent = true;
    },
    write(data) {
      response.chunks.push(data);
    },
    end(data) {
      response.body = data || "";
    },
    getBody() {
      return response.chunks.join("") + response.body;
    },
  };
  return response;
}

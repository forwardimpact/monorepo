import { spy } from "./spy.js";

const GH_METHODS = [
  "prCreate",
  "prMerge",
  "apiGet",
  "apiGetPaginated",
  "apiPost",
];

/**
 * Creates a mock `GhClient` collaborator. Each method is a spy returning the
 * configured `responses[method]` value (or a no-op default). Invocations are
 * recorded on `calls`.
 *
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.responses] - Per-method returns.
 * @returns {object} The mock gh client.
 */
export function createMockGhClient({ responses = {} } = {}) {
  const calls = [];
  const client = { calls };

  for (const method of GH_METHODS) {
    client[method] = spy(async (...args) => {
      calls.push({ method, args });
      if (method in responses) return responses[method];
      if (method === "prCreate") return "";
      if (method === "apiGetPaginated") return [];
      return null;
    });
  }

  return client;
}

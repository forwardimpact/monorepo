import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";

// Fixed test env path used across all mocked-fs tests.
export const TEST_ENV_PATH = "/test/.env";

/**
 * Build a test runtime with an in-memory fs.
 * @param {Object<string,string>} [files]
 */
export function makeRuntime(files = {}) {
  return createTestRuntime({ fs: createMockFs(files) });
}

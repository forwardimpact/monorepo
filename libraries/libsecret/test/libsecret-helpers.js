import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";

// All mocked-fs tests use this fixed test env path.
export const TEST_ENV_PATH = "/test/.env";

/**
 * Build a test runtime with an in-memory fs.
 * @param {Object<string,string>} [files]
 */
export function makeRuntime(files = {}) {
  return createTestRuntime({ fs: createMockFs(files) });
}

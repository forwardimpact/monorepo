import { mock } from "node:test";

/**
 * Creates a mock logger with call tracking
 * @param {object} options - Logger options
 * @param {boolean} options.captureOutput - Whether to capture log output
 * @returns {object} Mock logger
 */
export function createMockLogger(options = {}) {
  const logs = [];
  const capture = options.captureOutput ?? false;

  const createMethod = (level) =>
    mock.fn((appId, msg, attributes) => {
      if (capture) {
        logs.push({ level, appId, msg, attributes });
      }
    });

  return {
    logs,
    debug: createMethod("debug"),
    info: createMethod("info"),
    warn: createMethod("warn"),
    error: createMethod("error"),
    exception: createMethod("exception"),
  };
}

/**
 * Creates a silent logger that does nothing
 * @returns {object} Silent logger
 */
export function createSilentLogger() {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    exception: noop,
  };
}

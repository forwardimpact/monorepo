import { createLogger } from "@forwardimpact/libtelemetry";

export { ProcessState } from "./state.js";
export { LogWriter } from "./logger.js";
export { LongrunProcess } from "./longrun.js";
export { OneshotProcess } from "./oneshot.js";
export { SupervisionTree } from "./tree.js";

import { SupervisionTree } from "./tree.js";

/**
 * Creates a SupervisionTree with real dependencies wired
 * @param {string} logDir - Base directory for process logs
 * @param {object} [config] - Tree configuration
 * @param {number} [config.shutdownTimeout] - Timeout for graceful shutdown in ms
 * @returns {SupervisionTree}
 */
export function createSupervisionTree(logDir, config = {}) {
  const logger = createLogger("tree");
  return new SupervisionTree(logDir, { ...config, logger });
}

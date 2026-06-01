import { createLogger } from "@forwardimpact/libtelemetry";

export { ProcessState } from "./state.js";
export { LogWriter } from "./logger.js";
export { LongrunProcess } from "./longrun.js";
export { OneshotProcess } from "./oneshot.js";
export { SupervisionTree } from "./tree.js";

import { SupervisionTree } from "./tree.js";

/**
 * Creates a SupervisionTree with the injected runtime wired in.
 * @param {string} logDir - Base directory for process logs
 * @param {object} options - Factory options
 * @param {import("@forwardimpact/libutil/runtime").Runtime} options.runtime
 *   Injected runtime bag (the bin is the sole construction site).
 * @param {number} [options.shutdownTimeout] - Timeout for graceful shutdown in ms
 * @returns {SupervisionTree}
 */
export function createSupervisionTree(logDir, options = {}) {
  const { runtime, ...config } = options;
  if (!runtime) throw new Error("runtime is required");
  const logger = createLogger("tree", runtime);
  return new SupervisionTree(logDir, { ...config, runtime, logger });
}

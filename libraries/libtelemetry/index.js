// Re-export classes for direct use
// Note: Tracer, TraceVisualizer, and TraceIndex are NOT exported here to avoid
// circular dependency on generated code (via libtype and libindex->libtype chain).
// Import them directly from ./tracer.js, ./visualizer.js, and ./index/trace.js
export { Logger, createLogger } from "./logger.js";
export { Observer, createObserver } from "./observer.js";

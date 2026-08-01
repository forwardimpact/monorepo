// Re-export classes for direct use
// Note: this module does NOT export Tracer, TraceVisualizer, or TraceIndex.
// That avoids a circular dependency on generated code (through libtype and the
// libindex->libtype chain).
// Import them directly from ./tracer.js, ./visualizer.js, and ./index/trace.js
export { Logger, createLogger } from "./logger.js";
export { Observer, createObserver } from "./observer.js";

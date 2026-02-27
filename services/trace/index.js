import { services } from "@forwardimpact/librpc";
// eslint-disable-next-line no-unused-vars -- used in JSDoc type annotations
import { TraceIndex } from "@forwardimpact/libtelemetry/index/trace.js";

const { TraceBase } = services;

/**
 * Trace service for receiving and storing trace spans
 */
export class TraceService extends TraceBase {
  #index;

  /**
   * Creates a new Trace service instance
   * Note: Trace service does NOT accept a tracer parameter to avoid infinite recursion
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config - Service configuration
   * @param {TraceIndex} traceIndex - Initialized TraceIndex for storing traces
   */
  constructor(config, traceIndex) {
    super(config);
    if (!traceIndex) throw new Error("traceIndex is required");

    this.#index = traceIndex;
  }

  /**
   * Records a span to the trace index
   * @param {import("@forwardimpact/libtype").trace.Span} req - Span to record
   * @returns {Promise<import("@forwardimpact/libtype").trace.RecordSpanResponse>} Response
   */
  async RecordSpan(req) {
    if (!req.trace_id) throw new Error("trace_id is required");
    if (!req.span_id) throw new Error("span_id is required");

    await this.#index.add(req);
    return { success: true };
  }

  /**
   * Queries spans from the trace index
   * @param {import("@forwardimpact/libtype").trace.QueryRequest} req - Query request
   * @returns {Promise<import("@forwardimpact/libtype").trace.QueryResponse>} Response with spans
   */
  async QuerySpans(req) {
    const filter = req.filter || {};

    if (!req.query && !filter.trace_id && !filter.resource_id) {
      throw new Error("Either query, trace_id, or resource_id is required");
    }

    const spans = await this.#index.queryItems(req.query, filter);
    return { spans };
  }

  /**
   * Graceful shutdown with final flush
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.#index.flush();
  }
}

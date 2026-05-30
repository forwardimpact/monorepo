import { trace } from "@forwardimpact/libtype";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

/**
 * Compute the wall-clock offset (ns) relative to hrtime.bigint() using the
 * given clock, so nanosecond-precision timestamps are anchored to wall time
 * without calling `Date.now()` directly.
 *
 * Computed per-Span (rather than once at module load as the pre-1370 code did)
 * so an injected clock is honoured deterministically in tests. Trade-off: each
 * span anchors to its own `clock.now()` (ms resolution), so absolute per-span
 * timestamps are accurate but sub-millisecond *relative* ordering across spans
 * within a trace is not nanosecond-exact.
 * @param {object} clock - Clock collaborator with a `now()` method (returns ms)
 * @returns {bigint} Nanosecond offset
 */
function computeWallClockOffset(clock) {
  return BigInt(clock.now()) * 1_000_000n - process.hrtime.bigint();
}

/**
 * Returns current wall-clock time in nanoseconds since Unix epoch
 * @param {bigint} wallClockOffsetNs - Precomputed wall-clock offset
 * @returns {string} Nanosecond timestamp as string
 */
function nowNano(wallClockOffsetNs) {
  return String(process.hrtime.bigint() + wallClockOffsetNs);
}

/**
 * Represents a single span in a trace
 */
export class Span {
  #object;
  #traceClient;
  #wallClockOffsetNs;

  /**
   * Creates a new Span instance
   * @param {object} options - Span options
   * @param {string} options.name - Span name
   * @param {string} options.serviceName - Service name
   * @param {string} options.kind - Span kind (SERVER, CLIENT, INTERNAL)
   * @param {object} options.attributes - Initial span attributes
   * @param {string} [options.traceId] - Trace ID from parent context
   * @param {string} [options.parentSpanId] - Parent span ID from parent context
   * @param {object} options.traceClient - Trace service client
   * @param {import("@forwardimpact/libutil/runtime").Runtime} [options.runtime] - Optional runtime bag;
   *   falls back to `createDefaultClock()` so existing callers keep working unchanged.
   */
  constructor({
    name,
    serviceName,
    kind,
    attributes,
    traceId,
    parentSpanId,
    traceClient,
    runtime = null,
  }) {
    const clock = runtime?.clock ?? createDefaultClock();
    this.#wallClockOffsetNs = computeWallClockOffset(clock);
    this.#object = {
      trace_id: traceId || this.#generateId(),
      span_id: this.#generateId(),
      parent_span_id: parentSpanId || "",
      name,
      kind,
      start_time_unix_nano: nowNano(this.#wallClockOffsetNs),
      end_time_unix_nano: "",
      attributes: { service_name: serviceName, ...attributes },
      events: [],
      status: { code: trace.Code.UNSET, message: "" },
    };
    this.#traceClient = traceClient;
  }

  /**
   * Adds an event to the span
   * @param {string} name - Event name
   * @param {object} [attributes] - Event attributes
   */
  addEvent(name, attributes = {}) {
    this.#object.events.push({
      name,
      time_unix_nano: nowNano(this.#wallClockOffsetNs),
      attributes,
    });
  }

  /**
   * Sets an attribute on the span
   * @param {string} key - Attribute key
   * @param {string} value - Attribute value
   */
  setAttribute(key, value) {
    this.#object.attributes[key] = String(value);
  }

  /**
   * Sets the status to ERROR
   * @param {Error} error - Error object
   * @returns {void}
   */
  setError(error) {
    this.#object.status = {
      code: trace.Code.ERROR,
      message: error?.message || String(error),
    };
  }

  /**
   * Sets the status to OK
   * @returns {void}
   */
  setOk() {
    this.#object.status = {
      code: trace.Code.OK,
    };
  }

  /**
   * Ends the span and sends it to trace service
   * @returns {Promise<void>}
   */
  async end() {
    this.#object.end_time_unix_nano = nowNano(this.#wallClockOffsetNs);

    const span = trace.Span.fromObject(this.#object);
    await this.#traceClient.RecordSpan(span);
  }

  /**
   * Generates a random hex ID for trace/span IDs
   * @returns {string} Random hex string
   */
  #generateId() {
    return Math.random().toString(16).substring(2, 18);
  }

  /**
   * Gets the trace ID
   * @returns {string} Trace ID
   */
  get trace_id() {
    return this.#object.trace_id;
  }

  /**
   * Sets the trace ID
   * @param {string} trace_id - New trace ID
   */
  set trace_id(trace_id) {
    this.#object.trace_id = trace_id;
  }

  /**
   * Gets the span ID
   * @returns {string} Span ID
   */
  get span_id() {
    return this.#object.span_id;
  }

  /**
   * Gets the parent span ID
   * @returns {string} Parent span ID
   */
  get parent_span_id() {
    return this.#object.parent_span_id;
  }

  /**
   * Sets the parent span ID
   * @param {string} parent_span_id - New parent span ID
   */
  set parent_span_id(parent_span_id) {
    this.#object.parent_span_id = parent_span_id;
  }

  /**
   * Gets the resource ID
   * @returns {string} Resource ID
   */
  get resource_id() {
    return this.#object?.resource?.attributes?.id;
  }

  /**
   * Sets the resource ID
   * @param {string} resource_id - New resource ID
   */
  set resource_id(resource_id) {
    if (!this.#object.resource) {
      this.#object.resource = { attributes: {} };
    }
    this.#object.resource.attributes.id = resource_id;
  }
}

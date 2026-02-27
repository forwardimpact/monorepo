import { trace } from "@forwardimpact/libtype";

/**
 * Wall-clock offset: difference between Date.now() (ms since Unix epoch)
 * and hrtime.bigint() (ns since arbitrary point). Captured once at module load.
 * This allows converting hrtime to wall-clock time while preserving nanosecond precision.
 */
const WALL_CLOCK_OFFSET_NS =
  BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint();

/**
 * Returns current wall-clock time in nanoseconds since Unix epoch
 * @returns {string} Nanosecond timestamp as string
 */
function nowNano() {
  return String(process.hrtime.bigint() + WALL_CLOCK_OFFSET_NS);
}

/**
 * Represents a single span in a trace
 */
export class Span {
  #object;
  #traceClient;

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
   */
  constructor({
    name,
    serviceName,
    kind,
    attributes,
    traceId,
    parentSpanId,
    traceClient,
  }) {
    this.#object = {
      trace_id: traceId || this.#generateId(),
      span_id: this.#generateId(),
      parent_span_id: parentSpanId || "",
      name,
      kind,
      start_time_unix_nano: nowNano(),
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
      time_unix_nano: nowNano(),
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
    this.#object.end_time_unix_nano = nowNano();

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

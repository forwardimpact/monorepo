import jmespath from "jmespath";
import { BufferedIndex } from "@forwardimpact/libindex";
import { trace } from "@forwardimpact/libtype";

/**
 * Specialized index for trace spans with custom filtering
 * Extends BufferedIndex to provide trace-specific query capabilities
 * @augments BufferedIndex
 */
export class TraceIndex extends BufferedIndex {
  /**
   * Loads data from storage and reconstructs Span objects
   * Overrides parent to ensure proper protobuf enum deserialization
   * @returns {Promise<void>}
   */
  async loadData() {
    await super.loadData();

    // Reconstruct span objects from plain JSON to ensure proper enum values
    for (const item of this.index.values()) {
      if (item.span && typeof item.span === "object") {
        item.span = trace.Span.fromObject(item.span);
      }
    }
  }

  /**
   * Adds a span to the index with custom item structure
   * @param {import("@forwardimpact/libtype").trace.Span} span - Span to add to the index
   * @returns {Promise<void>}
   */
  async add(span) {
    const item = {
      id: span.span_id,
      span: span,
    };
    await super.add(item);
  }

  /**
   * Sorts spans chronologically by start time
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of spans to sort
   * @returns {import("@forwardimpact/libtype").trace.Span[]} Sorted array of spans
   */
  #sortSpansByTime(spans) {
    return spans.sort((a, b) => {
      const timeA = BigInt(a.start_time_unix_nano);
      const timeB = BigInt(b.start_time_unix_nano);
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
    });
  }

  /**
   * Finds all trace IDs that contain spans with the given resource_id
   * @param {string} resource_id - Resource ID to match
   * @param {string} [trace_id] - Optional trace ID filter
   * @returns {Set<string>} Set of matching trace IDs
   */
  #findTracesWithResource(resource_id, trace_id) {
    const matchingTraceIds = new Set();
    for (const item of this.index.values()) {
      const span = item.span;
      if (trace_id && span.trace_id !== trace_id) continue;
      if (span.resource?.attributes?.id === resource_id) {
        matchingTraceIds.add(span.trace_id);
      }
    }
    return matchingTraceIds;
  }

  /**
   * Gets all spans from the given trace IDs
   * @param {Set<string>} traceIds - Set of trace IDs to retrieve spans for
   * @returns {import("@forwardimpact/libtype").trace.Span[]} Array of spans from those traces
   */
  #getSpansFromTraces(traceIds) {
    const spans = [];
    for (const item of this.index.values()) {
      const span = item.span;
      if (traceIds.has(span.trace_id)) {
        spans.push(span);
      }
    }
    return spans;
  }

  /**
   * Gets all spans matching the optional trace_id filter
   * @param {string} [trace_id] - Optional trace ID filter
   * @returns {import("@forwardimpact/libtype").trace.Span[]} Array of matching spans
   */
  #getSpansByTraceId(trace_id) {
    const spans = [];
    for (const item of this.index.values()) {
      const span = item.span;
      if (!trace_id || span.trace_id === trace_id) {
        spans.push(span);
      }
    }
    return spans;
  }

  /**
   * Filters traces by evaluating JMESPath query per-trace
   * Returns trace IDs where the JMESPath query has a positive match
   * @param {Map<string, import("@forwardimpact/libtype").trace.Span[]>} traceGroups - Spans grouped by trace_id
   * @param {string} query - JMESPath expression to evaluate
   * @returns {string[]} Array of matching trace IDs
   */
  #filterTracesByQuery(traceGroups, query) {
    const matchingTraces = [];
    for (const [traceId, traceSpans] of traceGroups) {
      const result = jmespath.search(traceSpans, query);

      // If JMESPath returns a truthy/non-empty result, include the entire trace
      const hasMatch =
        result !== null &&
        result !== undefined &&
        result !== false &&
        (Array.isArray(result) ? result.length > 0 : true);

      if (hasMatch) {
        matchingTraces.push(traceId);
      }
    }
    return matchingTraces;
  }

  /**
   * Queries spans from the index using trace-specific filters and JMESPath expressions
   * Overrides the base queryItems to support trace_id and resource_id filtering
   * When filtering by resource_id, returns all spans from traces that contain
   * at least one span with that resource_id (complete trace visualization)
   * JMESPath queries are evaluated per-trace to select which complete traces to return
   * Returns spans sorted chronologically by start time
   * @param {string|null} [query] - Optional JMESPath expression to filter traces (not spans)
   * @param {object} [filter] - Filter object for query constraints
   * @param {string} [filter.trace_id] - Filter by trace ID
   * @param {string} [filter.resource_id] - Filter by resource ID
   * @returns {Promise<import("@forwardimpact/libtype").trace.Span[]>} Array of spans matching the filter, sorted by start time
   */
  async queryItems(query = null, filter = {}) {
    if (!this.loaded) await this.loadData();

    const { trace_id, resource_id } = filter;

    // Apply trace_id and resource_id filters first to get candidate spans
    let spans;
    if (resource_id) {
      const matchingTraceIds = this.#findTracesWithResource(
        resource_id,
        trace_id,
      );
      spans = this.#getSpansFromTraces(matchingTraceIds);
    } else {
      spans = this.#getSpansByTraceId(trace_id);
    }

    // Sort spans chronologically
    spans = this.#sortSpansByTime(spans);

    // If no JMESPath query, return all spans
    if (!query) {
      return spans;
    }

    // Group spans by trace_id for per-trace JMESPath evaluation
    const traceGroups = new Map();
    for (const span of spans) {
      if (!traceGroups.has(span.trace_id)) {
        traceGroups.set(span.trace_id, []);
      }
      traceGroups.get(span.trace_id).push(span);
    }

    // Apply JMESPath query per-trace to determine which traces match
    const matchingTraces = this.#filterTracesByQuery(traceGroups, query);

    // Return all spans from matching traces
    const matchingSpans = spans.filter((span) =>
      matchingTraces.includes(span.trace_id),
    );

    return matchingSpans;
  }
}

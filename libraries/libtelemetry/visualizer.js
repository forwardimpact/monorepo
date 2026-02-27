import { trace } from "@forwardimpact/libtype";

/**
 * Visualizes trace spans as Mermaid sequence diagrams
 * Focuses on service interactions and call sequences
 */
export class TraceVisualizer {
  #traceIndex;

  /**
   * Creates a new TraceVisualizer instance
   * @param {import("./index.js").TraceIndex} traceIndex - Initialized TraceIndex instance
   */
  constructor(traceIndex) {
    if (!traceIndex) throw new Error("traceIndex is required");
    this.#traceIndex = traceIndex;
  }

  /**
   * Creates a visualization of traces matching the given filter and query
   * @param {string|null} [query] - Optional JMESPath query expression
   * @param {object} [filter] - Filter object for trace query
   * @param {string} [filter.trace_id] - Filter by trace ID
   * @param {string} [filter.resource_id] - Filter by resource ID
   * @returns {Promise<string>} Raw Mermaid sequence diagram syntax
   */
  async visualize(query = null, filter = {}) {
    const spans = await this.#traceIndex.queryItems(query, filter);

    if (spans.length === 0) {
      return "No spans found matching the filter criteria.";
    }

    // Group spans by trace_id
    const traceGroups = this.#groupByTrace(spans);

    // If resource_id filter is provided, always use combined visualization
    // with resource-based title (even for single traces)
    if (filter.resource_id) {
      return this.#visualizeCombinedTraces(traceGroups, filter.resource_id);
    }

    // No resource filter - use separate diagrams with trace IDs
    const visualizations = [];
    for (const [traceId, traceSpans] of traceGroups) {
      visualizations.push(this.#visualizeTrace(traceId, traceSpans));
    }

    return visualizations.join("\n\n");
  }

  /**
   * Groups spans by trace_id
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of spans
   * @returns {Map<string, import("@forwardimpact/libtype").trace.Span[]>} Map of trace_id to spans
   */
  #groupByTrace(spans) {
    const groups = new Map();
    for (const span of spans) {
      if (!groups.has(span.trace_id)) {
        groups.set(span.trace_id, []);
      }
      groups.get(span.trace_id).push(span);
    }
    return groups;
  }

  /**
   * Visualizes a single trace as a Mermaid sequence diagram
   * @param {string} traceId - Trace ID
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of spans in the trace
   * @returns {string} Raw Mermaid sequence diagram syntax
   */
  #visualizeTrace(traceId, spans) {
    const lines = [];

    // Mermaid header
    lines.push("sequenceDiagram");
    lines.push(`    title Trace: ${traceId}`);
    lines.push("");

    // Extract participants (services)
    const participants = this.#extractParticipants(spans);
    for (const participant of participants) {
      lines.push(`    participant ${participant}`);
    }
    lines.push("");

    // Generate timeline events and process in chronological order
    const timelineEvents = this.#generateTimelineEvents(spans);
    const interactionLines = this.#processTimelineEvents(timelineEvents, spans);
    lines.push(...interactionLines);

    return lines.join("\n");
  }

  /**
   * Generates timeline events from spans for chronological processing
   * Creates both "start" and "end" events for each span
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of spans
   * @returns {Array<{type: 'start'|'end', time: bigint, span: object}>} Timeline events
   */
  #generateTimelineEvents(spans) {
    const events = [];

    for (const span of spans) {
      // Only process CLIENT spans (they represent the interactions)
      if (span.kind === trace.Kind.CLIENT) {
        const startTime = BigInt(span.start_time_unix_nano);
        const endTime = BigInt(span.end_time_unix_nano);

        events.push({ type: "start", time: startTime, span });
        events.push({ type: "end", time: endTime, span });
      }
    }

    // Sort events chronologically
    events.sort((a, b) => {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      // If same time, process 'start' before 'end'
      if (a.type === "start" && b.type === "end") return -1;
      if (a.type === "end" && b.type === "start") return 1;
      return 0;
    });

    return events;
  }

  /**
   * Processes timeline events in chronological order to generate properly nested interactions
   * @param {Array<{type: 'start'|'end', time: bigint, span: object}>} events - Timeline events
   * @param {import("@forwardimpact/libtype").trace.Span[]} allSpans - All spans in trace
   * @returns {string[]} Array of Mermaid sequence diagram lines
   */
  #processTimelineEvents(events, allSpans) {
    const lines = [];

    for (const event of events) {
      const span = event.span;
      const fromService = span.attributes["service_name"];

      // Find the corresponding SERVER span
      const serverSpan = this.#findServerSpan(allSpans, span);
      if (!serverSpan) continue;

      const toService = serverSpan.attributes["service_name"];
      const method = span.attributes["rpc_method"];

      if (!fromService || !toService || !method) continue;

      if (event.type === "start") {
        // Generate request line with timestamp first
        const timestamp = this.#formatTimestamp(span.start_time_unix_nano);
        const requestAttrs = this.#extractAttributes(span, [
          "request_sent",
          "stream_started",
        ]);
        const requestStr = requestAttrs
          ? ` (time=${timestamp}, ${requestAttrs})`
          : ` (time=${timestamp})`;
        lines.push(
          `    ${fromService}->>+${toService}: ${method}${requestStr}`,
        );
      } else {
        // Generate response line
        const returnLine = this.#generateReturnLine(
          fromService,
          toService,
          serverSpan,
        );
        lines.push(returnLine);
      }
    }

    return lines;
  }

  /**
   * Generates the return line for a service interaction
   * @param {string} fromService - Source service name
   * @param {string} toService - Target service name
   * @param {import("@forwardimpact/libtype").trace.Span} serverSpan - SERVER span
   * @returns {string} Mermaid return line
   */
  #generateReturnLine(fromService, toService, serverSpan) {
    // Convert numeric Code enum to string representation
    const statusCodeNum = serverSpan.status?.code ?? trace.Code.UNSET;
    const statusCode =
      Object.keys(trace.Code).find(
        (key) => trace.Code[key] === statusCodeNum,
      ) || "UNSET";
    const errorMessage = serverSpan.status?.message || "";

    // If there's an error, show error message instead of attributes
    if (statusCode === "ERROR" && errorMessage) {
      return `    ${toService}-->>-${fromService}: ${statusCode} (${errorMessage})`;
    }

    const responseAttrs = this.#extractAttributes(serverSpan, [
      "response_sent",
      "stream_ended",
    ]);
    const responseStr = responseAttrs ? ` (${responseAttrs})` : "";
    return `    ${toService}-->>-${fromService}: ${statusCode}${responseStr}`;
  }

  /**
   * Extracts unique service participants from spans in architectural order
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of spans
   * @returns {string[]} Array of participant service names in architectural order
   */
  #extractParticipants(spans) {
    const participantSet = new Set();

    for (const span of spans) {
      const serviceName = span.attributes["service_name"];
      if (serviceName) {
        participantSet.add(serviceName);
      }

      // For CLIENT spans, also add the target service
      if (span.kind === trace.Kind.CLIENT) {
        const rpcService = span.attributes["rpc_service"];
        if (rpcService) {
          participantSet.add(rpcService);
        }
      }
    }

    // Define architectural order of services
    const serviceOrder = [
      "cli",
      "agent",
      "memory",
      "llm",
      "tool",
      "graph",
      "vector",
    ];

    // Return participants in architectural order
    return serviceOrder.filter((service) => participantSet.has(service));
  }

  /**
   * Finds the corresponding SERVER span for a CLIENT span
   * @param {import("@forwardimpact/libtype").trace.Span[]} spans - Array of all spans
   * @param {import("@forwardimpact/libtype").trace.Span} clientSpan - CLIENT span to find match for
   * @returns {import("@forwardimpact/libtype").trace.Span|null} Matching SERVER span or null
   */
  #findServerSpan(spans, clientSpan) {
    return (
      spans.find(
        (span) =>
          span.kind === trace.Kind.SERVER &&
          span.parent_span_id === clientSpan.span_id,
      ) || null
    );
  }

  /**
   * Extracts attributes from span events matching specified event names
   * @param {import("@forwardimpact/libtype").trace.Span} span - Span to extract attributes from
   * @param {string[]} eventNames - Event names to search for
   * @returns {string} Formatted attribute string or empty string
   */
  #extractAttributes(span, eventNames) {
    if (!span.events) return "";

    const event = span.events.find((e) => eventNames.includes(e.name));

    if (!event || !event.attributes) return "";

    return this.#formatAttributes(event.attributes);
  }

  /**
   * Formats attributes object into key: value string
   * @param {object} attributes - Attributes object from event
   * @returns {string} Formatted string like "key1: value1, key2: value2"
   */
  #formatAttributes(attributes) {
    const pairs = Object.entries(attributes)
      .filter(
        ([key, value]) =>
          !key.startsWith("filter_") && // Less busy output
          value !== "" &&
          value !== undefined &&
          value !== null &&
          value !== "null" &&
          value !== "undefined",
      )
      .map(([key, value]) => `${key}=${value}`);

    return pairs.join(", ");
  }

  /**
   * Formats a nanosecond timestamp to ISO 8601 format
   * @param {string|bigint} nanoTimestamp - Timestamp in nanoseconds
   * @returns {string} Timestamp in ISO 8601 format (e.g., 2022-04-29T18:52:58.114Z)
   */
  #formatTimestamp(nanoTimestamp) {
    const nanos = BigInt(nanoTimestamp);
    const millis = Number(nanos / 1000000n);
    return new Date(millis).toISOString();
  }

  /**
   * Visualizes multiple traces as a single combined Mermaid sequence diagram
   * Used when filtering by resource_id to show conversation flow across requests
   * @param {Map<string, import("@forwardimpact/libtype").trace.Span[]>} traceGroups - Map of trace_id to spans
   * @param {string} resourceId - Resource ID being visualized
   * @returns {string} Raw Mermaid sequence diagram syntax
   */
  #visualizeCombinedTraces(traceGroups, resourceId) {
    const lines = [];

    // Mermaid header
    lines.push("sequenceDiagram");
    lines.push(`    title Resource: ${resourceId}`);
    lines.push("");

    // Extract all unique participants across all traces
    const allSpans = Array.from(traceGroups.values()).flat();
    const participants = this.#extractParticipants(allSpans);
    for (const participant of participants) {
      lines.push(`    participant ${participant}`);
    }

    // Process each trace in order
    for (const [traceId, traceSpans] of traceGroups) {
      // Generate timeline events and process in chronological order
      const timelineEvents = this.#generateTimelineEvents(traceSpans);
      const interactionLines = this.#processTimelineEvents(
        timelineEvents,
        traceSpans,
      );

      // Only add trace separator if there are interaction lines
      if (interactionLines.length > 0) {
        lines.push("");
        lines.push(`    Note over agent: Trace: ${traceId}`);
        lines.push("");
        lines.push(...interactionLines);
      }
    }

    return lines.join("\n");
  }
}

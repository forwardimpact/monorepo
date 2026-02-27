#!/usr/bin/env node
import { Repl } from "@forwardimpact/librepl";
import { createStorage } from "@forwardimpact/libstorage";

import { TraceIndex } from "../index/trace.js";
import { TraceVisualizer } from "../visualizer.js";

const usage = `**Usage:** <JMESPath expression>

Query and visualize traces from the trace index using JMESPath expressions.
Apply filters to narrow down traces before querying.

**Examples:**

    echo "[?name=='ProcessStream']" | make cli-visualize
    echo "[]" | make cli-visualize ARGS="--trace 0f53069dbc62d"
    echo "[?kind==\`2\`]" | make cli-visualize
    echo "[?contains(name, 'QueryByPattern')]" | make cli-visualize ARGS="--resource common.Conversation.abc123"`;

/**
 * Queries and visualizes traces using JMESPath
 * @param {string} prompt - The JMESPath query expression
 * @param {object} state - REPL state containing trace filters and indices
 * @param {import("stream").Writable} outputStream - Stream to write results to
 */
async function queryTraces(prompt, state, outputStream) {
  const { trace_id, resource_id, visualizer } = state;

  const filter = {};
  if (trace_id) {
    filter.trace_id = trace_id;
  }
  if (resource_id) {
    filter.resource_id = resource_id;
  }

  // If prompt is empty, visualize without JMESPath query
  const query = prompt.trim() || null;

  const visualization = await visualizer.visualize(query, filter);

  // If no spans found, return as-is
  if (visualization.startsWith("No spans found")) {
    outputStream.write(visualization);
  } else {
    // Wrap raw Mermaid syntax in code block
    outputStream.write(`\`\`\`mermaid\n${visualization}\n\`\`\``);
  }
}

// Create REPL with dependency injection
const repl = new Repl({
  usage,

  setup: async (state) => {
    const traceStorage = createStorage("traces");
    state.traceIndex = new TraceIndex(traceStorage, "index.jsonl");
    state.visualizer = new TraceVisualizer(state.traceIndex);
  },

  state: {
    trace_id: null,
    resource_id: null,
  },

  commands: {
    trace: {
      usage: "Filter traces by trace ID",
      handler: (args, state) => {
        if (args.length === 0) {
          return "Usage: /trace <id>";
        }
        state.trace_id = args[0];
      },
    },
    resource: {
      usage: "Filter traces by resource ID",
      handler: (args, state) => {
        if (args.length === 0) {
          return "Usage: /resource <id>";
        }
        state.resource_id = args[0];
      },
    },
  },

  onLine: queryTraces,
});

repl.start();

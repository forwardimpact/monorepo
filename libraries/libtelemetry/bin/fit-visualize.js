#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";
import { Repl } from "@forwardimpact/librepl";
import { createStorage } from "@forwardimpact/libstorage";

import { TraceIndex } from "../src/index/trace.js";
import { TraceVisualizer } from "../src/visualizer.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "fit-visualize",
  description:
    "Query and visualize OpenTelemetry spans using JMESPath expressions",
  globalOptions: {
    trace: { type: "string", description: "Filter spans by trace ID" },
    resource: {
      type: "string",
      description: "Filter spans by resource ID",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "echo \"[?name=='ProcessStream']\" | fit-visualize",
    'echo "[]" | fit-visualize --trace 0f53069dbc62d',
  ],
  documentation: [
    {
      title: "Add Observability",
      url: "https://www.forwardimpact.team/docs/libraries/service-lifecycle/add-observability/index.md",
      description:
        "Structured logs and spans with no framework setup, including querying and visualizing recorded spans with fit-visualize.",
    },
    {
      title: "Manage Service Lifecycle from One Interface",
      url: "https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md",
      description:
        "The full lifecycle setup for services, from supervision to observability.",
    },
  ],
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

const parsed = cli.parse(runtime.proc.argv.slice(2));
if (!parsed) runtime.proc.exit(0);

const { values } = parsed;

const usage = `**Usage:** <JMESPath expression>

Query and visualize spans from the span index using JMESPath expressions.
Apply filters to narrow the spans before querying.

**Examples:**

    echo "[?name=='ProcessStream']" | just cli-visualize
    echo "[]" | just cli-visualize ARGS="--trace 0f53069dbc62d"
    echo "[?kind==\`2\`]" | just cli-visualize
    echo "[?contains(name, 'QueryByPattern')]" | just cli-visualize ARGS="--resource common.Conversation.abc123"`;

/**
 * Queries and visualizes spans using JMESPath
 * @param {string} prompt - The JMESPath query expression
 * @param {object} state - REPL state containing span filters and indices
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
    const spanStorage = createStorage("spans");
    state.traceIndex = new TraceIndex(spanStorage, "index.jsonl", {
      clock: runtime.clock,
    });
    state.visualizer = new TraceVisualizer(state.traceIndex, runtime);
  },

  state: {
    trace_id: values.trace || null,
    resource_id: values.resource || null,
  },

  commands: {
    trace: {
      usage: "Filter spans by trace ID",
      handler: (args, state) => {
        if (args.length === 0) {
          return "Usage: /trace <id>";
        }
        state.trace_id = args[0];
      },
    },
    resource: {
      usage: "Filter spans by resource ID",
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

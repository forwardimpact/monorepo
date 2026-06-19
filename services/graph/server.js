#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createGraphIndex } from "@forwardimpact/libgraph";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { GraphService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcgraph",
  description: "Graph index gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("graph", {
    port: 3003,
  });

  // Initialize observability
  const runtime = createDefaultRuntime();
  const logger = createLogger("graph", runtime);
  const tracer = await createTracer("graph");

  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const service = new GraphService(config, graphIndex);
  const server = new Server(service, config, { logger, tracer, runtime });

  await server.start();
}

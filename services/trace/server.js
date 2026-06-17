#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { TraceIndex } from "@forwardimpact/libtelemetry/index/trace.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { TraceService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svctrace",
  description: "Trace index gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("trace", {
    port: 3001,
  });
  const runtime = createDefaultRuntime();
  const { clock } = runtime;

  // Initialize storage for traces
  const traceStorage = createStorage("traces");

  // Create trace index
  const traceIndex = new TraceIndex(traceStorage, "index.jsonl", { clock });

  const service = new TraceService(config, traceIndex);
  const server = new Server(service, config, { runtime });
  await server.start();
}

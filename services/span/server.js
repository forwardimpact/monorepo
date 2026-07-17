#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { TraceIndex } from "@forwardimpact/libtelemetry/index/trace.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { SpanService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcspan",
  description: "Span index gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("span", {
    port: 3001,
  });
  const runtime = createDefaultRuntime();
  const { clock } = runtime;

  // Initialize storage for spans
  const spanStorage = createStorage("spans");

  // Create span index
  const traceIndex = new TraceIndex(spanStorage, "index.jsonl", { clock });

  const service = new SpanService(config, traceIndex);
  const server = new Server(service, config, { runtime });
  await server.start();
}

#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { BridgeService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcbridge",
  description: "Threaded-discussion store gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("bridge", {
    port: 3012,
    discussion_flush_interval_ms: 5_000,
    discussion_max_buffer_size: 1_000,
    origin_flush_interval_ms: 1_000,
    origin_max_buffer_size: 100,
    conversation_ttl_ms: 24 * 60 * 60 * 1000,
    origin_ttl_ms: 24 * 60 * 60 * 1000,
    sweep_interval_ms: 60_000,
  });

  // Initialize observability
  const runtime = createDefaultRuntime();
  const logger = createLogger("bridge", runtime);
  const tracer = await createTracer("bridge");

  const storage = createStorage("bridges");
  const { clock } = runtime;

  const service = new BridgeService(config, { storage, logger, tracer, clock });
  const server = new Server(service, config, { logger, tracer, runtime });

  await server.start();
}

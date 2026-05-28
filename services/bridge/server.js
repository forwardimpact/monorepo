#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { Server, createTracer } from "@forwardimpact/librpc";
import { createStorage } from "@forwardimpact/libstorage";

import { BridgeService } from "./index.js";

const config = await createServiceConfig("bridge", {
  discussion_flush_interval_ms: 5_000,
  discussion_max_buffer_size: 1_000,
  origin_flush_interval_ms: 1_000,
  origin_max_buffer_size: 100,
  conversation_ttl_ms: 24 * 60 * 60 * 1000,
  origin_ttl_ms: 24 * 60 * 60 * 1000,
  sweep_interval_ms: 60_000,
});
const logger = createLogger("bridge");
const tracer = await createTracer("bridge");
const storage = createStorage("bridges");

const service = new BridgeService(config, { storage, logger, tracer });
await new Server(service, config).start();

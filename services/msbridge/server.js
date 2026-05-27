#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge");
const logger = createLogger("msbridge");
const tracer = await createTracer("msbridge");

const storage = createStorage("bridges/msbridge");

const { GhauthClient } = clients;
const ghauthConfig = await createServiceConfig("ghauth");
const ghauthClient = new GhauthClient(ghauthConfig, logger, tracer);

const service = new MsBridgeService(config, {
  logger,
  tracer,
  storage,
  ghauthClient,
});
await service.start();

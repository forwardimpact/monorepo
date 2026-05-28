#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  github_repo: "",
  callback_base_url: "",
});
const logger = createLogger("msbridge");
const tracer = await createTracer("msbridge");

const { GhauthClient, BridgeClient } = clients;
const ghauthConfig = await createServiceConfig("ghauth");
const ghauthClient = new GhauthClient(ghauthConfig, logger, tracer);
const bridgeConfig = await createServiceConfig("bridge");
const discussionClient = new BridgeClient(bridgeConfig, logger, tracer);

const service = new MsBridgeService(config, {
  logger,
  tracer,
  discussionClient,
  ghauthClient,
});
await service.start();

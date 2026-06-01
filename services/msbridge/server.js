#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  github_repo: "",
  callback_base_url: "",
});
const runtime = createDefaultRuntime();
const logger = createLogger("msbridge", runtime);
const tracer = await createTracer("msbridge");

const { GhuserClient, BridgeClient } = clients;
const ghuserConfig = await createServiceConfig("ghuser");
const ghuserClient = new GhuserClient(ghuserConfig, logger, tracer);
const bridgeConfig = await createServiceConfig("bridge");
const discussionClient = new BridgeClient(bridgeConfig, logger, tracer);

const { clock } = runtime;

const service = new MsBridgeService(config, {
  logger,
  tracer,
  discussionClient,
  ghuserClient,
  clock,
});
await service.start();

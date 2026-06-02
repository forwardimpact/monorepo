#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  github_repo: "",
  callback_base_url: "",
  trusted_idp_origins: "",
  link_completion_ticket_secret: "",
});

assertNonEmpty(config.trusted_idp_origins, "trusted_idp_origins");
assertNonEmpty(
  config.link_completion_ticket_secret,
  "link_completion_ticket_secret",
);

const runtime = createDefaultRuntime();
const logger = createLogger("msbridge", runtime);
const tracer = await createTracer("msbridge");

const trustedOrigins = loadTrustedIdpOrigins(config.trusted_idp_origins, {
  logger,
});
assertNonEmpty(trustedOrigins, "trusted_idp_origins (loaded)");

const { GhuserClient, BridgeClient } = clients;
const ghuserConfig = await createServiceConfig("ghuser");
const ghuserClient = new GhuserClient(ghuserConfig, runtime, logger, tracer);
const bridgeConfig = await createServiceConfig("bridge");
const discussionClient = new BridgeClient(
  bridgeConfig,
  runtime,
  logger,
  tracer,
);

const { clock } = runtime;

const service = new MsBridgeService(config, {
  logger,
  tracer,
  discussionClient,
  ghuserClient,
  clock,
  trustedOrigins,
  ticketSecret: config.link_completion_ticket_secret,
});
await service.start();

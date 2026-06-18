#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";
import { clients, Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";
import { GhuserService } from "./index.js";
import { BindingStore, FlowStore, GrantStore } from "./src/stores.js";
import { createGithubOAuth } from "./src/github-oauth.js";

const config = await createServiceConfig("ghuser", {
  port: 3009,
  client_id: "",
  client_secret: "",
  link_base_url: "",
  idp_origin: "",
  trusted_idp_origins: "",
  link_completion_ticket_secret: "",
});

assertNonEmpty(config.idp_origin, "idp_origin");
assertNonEmpty(config.trusted_idp_origins, "trusted_idp_origins");
assertNonEmpty(
  config.link_completion_ticket_secret,
  "link_completion_ticket_secret",
);

const runtime = createDefaultRuntime();
const logger = createLogger("ghuser", runtime);
const tracer = await createTracer("ghuser");
const storage = createStorage("ghuser");

const trustedOrigins = loadTrustedIdpOrigins(config.trusted_idp_origins, {
  logger,
});
assertNonEmpty(trustedOrigins, "trusted_idp_origins (loaded)");

const github = createGithubOAuth({
  clientId: config.client_id,
  clientSecret: config.client_secret,
});

const { clock } = runtime;
const bindings = new BindingStore(storage, { clock });
const flows = new FlowStore(storage, { clock });
const grants = new GrantStore(storage, { clock });

const { BridgeClient } = clients;
const bridgeConfig = await createServiceConfig("bridge");
const bridgeClient = new BridgeClient(bridgeConfig, runtime, logger, tracer);

const service = new GhuserService(config, {
  bindings,
  flows,
  grants,
  github,
  clock,
  idpOrigin: config.idp_origin,
  trustedOrigins,
  ticketSecret: config.link_completion_ticket_secret,
  bridgeClient,
  logger,
});
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await service.shutdown();
    process.exit(0);
  });
}

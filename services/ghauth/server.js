#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { GhauthService } from "./index.js";
import { BindingStore, FlowStore, GrantStore } from "./src/stores.js";
import { createGithubOAuth } from "./src/github-oauth.js";

const config = await createServiceConfig("ghauth", {
  protocol: "grpc",
  port: 3006,
  link_base_url: "http://localhost:3007",
  client_id: "",
  client_secret: "",
});

const logger = createLogger("ghauth");
const tracer = await createTracer("ghauth");
const storage = createStorage("ghauth");

const github = createGithubOAuth({
  clientId: config.client_id,
  clientSecret: config.client_secret,
});

const bindings = new BindingStore(storage);
const flows = new FlowStore(storage);
const grants = new GrantStore(storage);

const service = new GhauthService(config, { bindings, flows, grants, github });
const server = new Server(service, config, logger, tracer);

await server.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await service.shutdown();
    process.exit(0);
  });
}

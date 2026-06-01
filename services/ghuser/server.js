#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { GhuserService } from "./index.js";
import { BindingStore, FlowStore, GrantStore } from "./src/stores.js";
import { createGithubOAuth } from "./src/github-oauth.js";

const config = await createServiceConfig("ghuser", {
  client_id: "",
  client_secret: "",
  link_base_url: "",
});

const runtime = createDefaultRuntime();
const logger = createLogger("ghuser", runtime);
const tracer = await createTracer("ghuser");
const storage = createStorage("ghuser");

const github = createGithubOAuth({
  clientId: config.client_id,
  clientSecret: config.client_secret,
});

const { clock } = runtime;
const bindings = new BindingStore(storage, { clock });
const flows = new FlowStore(storage, { clock });
const grants = new GrantStore(storage, { clock });

const service = new GhuserService(config, {
  bindings,
  flows,
  grants,
  github,
  clock,
});
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await service.shutdown();
    process.exit(0);
  });
}

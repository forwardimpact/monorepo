#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createOidcService } from "./index.js";

const config = await createServiceConfig("oidc", {
  provider: "ghserver",
  issuer: "https://token.actions.githubusercontent.com",
  audience: "fit-ghserver",
  jwks_ttl_ms: 600_000,
  jwks_cooldown_ms: 30_000,
  port: 9202,
});

const runtime = createDefaultRuntime();
const { clock } = runtime;
const logger = createLogger("oidc", runtime);
const providerClient = await createClient(config.provider, logger);

const service = createOidcService({ config, logger, providerClient, clock });
await service.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}

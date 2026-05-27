#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createOauthService } from "./index.js";

const config = await createServiceConfig("oauth", {
  protocol: "http",
  port: 3007,
  issuer: "http://localhost:3007",
  provider: "ghauth",
});

const logger = createLogger("oauth");
const providerClient = await createClient(config.provider, logger);

const service = createOauthService({ config, logger, providerClient });
await service.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}

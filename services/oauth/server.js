#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createOauthService } from "./index.js";

const config = await createServiceConfig("oauth", {
  provider: "ghuser",
  issuer: "",
});

const runtime = createDefaultRuntime();
const logger = createLogger("oauth", runtime);
const providerClient = await createClient(config.provider, logger);

const service = createOauthService({ config, logger, providerClient });
await service.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => service.stop());
}

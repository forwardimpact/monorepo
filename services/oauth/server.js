#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createOauthService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcoauth",
  description: "OAuth 2.1 authorization server adapter",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("oauth", {
    protocol: "http",
    port: 3010,
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
}

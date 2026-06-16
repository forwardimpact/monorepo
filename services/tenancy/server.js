#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { TenancyService } from "./index.js";
import { TenantStore } from "./src/tenant-store.js";

const config = await createServiceConfig("tenancy", {});

const runtime = createDefaultRuntime();
const { clock } = runtime;
const logger = createLogger("tenancy", runtime);
const tracer = await createTracer("tenancy");
const storage = createStorage("tenancy");

const tenants = new TenantStore(storage, { clock });

const service = new TenancyService(config, { tenants });
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await service.shutdown();
    process.exit(0);
  });
}

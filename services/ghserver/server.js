#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";
import { Server, clients, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { GhserverService, RateCeiling, createAppAuthCustody } from "./index.js";
import { assertBindAllowed } from "./src/bind-guard.js";

const config = await createServiceConfig("ghserver", {
  app_id: "",
  private_key: "",
  host: "127.0.0.1",
  port: 9201,
  allow_public_bind: false,
  rate_ceiling_per_tenant_per_minute: 10,
});

// GitHub App ids are all-digits, so libconfig coerces SERVICE_GHSERVER_APP_ID
// to a number; normalise to a string for the (string-only) assert and for
// @octokit/auth-app downstream.
const appId = String(config.app_id ?? "");

// The App private key is the only signing material in the control plane.
// It resolves from SERVICE_GHSERVER_PRIVATE_KEY at runtime; substrate
// hardening (KMS/HSM custody) is the deferred follow-on per
// design § "What this design does not cover".
assertNonEmpty(appId, "app_id");
assertNonEmpty(config.private_key, "private_key");

// Refuse a public bind unless explicitly opted in (see src/bind-guard.js).
assertBindAllowed(config.host, config.allow_public_bind);

const runtime = createDefaultRuntime();
const { clock } = runtime;
const logger = createLogger("ghserver", runtime);
const tracer = await createTracer("ghserver");

const { TenancyClient } = clients;
const tenancyConfig = await createServiceConfig("tenancy");
const tenancy = new TenancyClient(tenancyConfig, runtime, logger, tracer);

const appAuth = createAppAuthCustody({
  app_id: appId,
  private_key: config.private_key,
});
const rateCeiling = new RateCeiling({
  clock,
  limit: config.rate_ceiling_per_tenant_per_minute,
});

const service = new GhserverService(config, {
  tenancy,
  appAuth,
  rateCeiling,
  logger,
});
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => process.exit(0));
}

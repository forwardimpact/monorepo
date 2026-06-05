#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";

import {
  DefaultTenantResolver,
  RegistryTenantResolver,
} from "@forwardimpact/libbridge";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  github_repo: "",
  callback_base_url: "",
  trusted_idp_origins: "",
  link_completion_ticket_secret: "",
  // "single" (default, self-hosted) binds a static Microsoft tenant id;
  // "multi" (hosted) accepts any consenting Entra tenant and mints
  // repo-scoped GitHub tokens through services/ghserver.
  tenancy_mode: "single",
});

function parseRepo(githubRepo) {
  if (typeof githubRepo !== "string" || !githubRepo) return undefined;
  const [owner, name] = githubRepo.split("/");
  if (!owner || !name) return undefined;
  return { owner, name };
}

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

const { GhuserClient, BridgeClient, TenancyClient, GhserverClient } = clients;

// Pick the tenant resolver and the control-plane clients from the mode.
// Multi-tenant resolves tenants through services/tenancy and mints GitHub
// tokens through services/ghserver; single-tenant reaches neither.
let tenantResolver;
let ghserverClient;
let tenancyClient;
if (config.tenancy_mode === "multi") {
  const tenancyConfig = await createServiceConfig("tenancy");
  tenancyClient = new TenancyClient(tenancyConfig, runtime, logger, tracer);
  const ghserverConfig = await createServiceConfig("ghserver");
  ghserverClient = new GhserverClient(ghserverConfig, runtime, logger, tracer);
  tenantResolver = new RegistryTenantResolver({ client: tenancyClient });
} else {
  tenantResolver = new DefaultTenantResolver({
    channel: "msteams",
    repo: parseRepo(config.github_repo),
  });
}

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

// `authenticateTenant` verifies the inbound Bot Framework bearer JWT and
// returns its Entra `tid` claim (or null). Full Bot Framework JWT signature
// validation — fetching Microsoft's OpenID metadata and signing keys via
// botframework-connector's JwtTokenValidation — is a peer-authentication
// substrate tracked as a plan concern (design § services/ghserver). Until that
// substrate lands, no production verifier is injected: the onboarding endpoint
// stays default-deny (every /onboard returns 401) rather than trusting an
// unvalidated claim. A verifier injected here makes the happy path reachable;
// the resolved-tid → registry-row → SetRepo contract is exercised by
// services/msbridge/test/onboard-handler.test.js.
const authenticateTenant = undefined;

const service = new MsBridgeService(config, {
  logger,
  tracer,
  discussionClient,
  ghuserClient,
  tenantResolver,
  ghserverClient,
  tenancyClient,
  authenticateTenant,
  clock,
  trustedOrigins,
  ticketSecret: config.link_completion_ticket_secret,
});
await service.start();

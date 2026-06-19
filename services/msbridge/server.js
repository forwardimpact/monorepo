#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
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
import { createOnboardVerifier } from "./src/onboard-verifier.js";
import { createBotFrameworkAuthentication } from "./src/teams.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcmsbridge",
  description: "Microsoft Teams bridge service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("msbridge", {
    protocol: "http",
    port: 3014,
    github_repo: "",
    callback_base_url: "",
    trusted_idp_origins: "",
    link_completion_ticket_secret: "",
    // "single" (default, self-hosted) binds a static Microsoft tenant id;
    // "multi" (hosted) accepts any consenting Entra tenant.
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

  const { GhuserClient, BridgeClient, TenancyClient } = clients;

  // Pick the tenant resolver and the control-plane clients from the mode.
  // Multi-tenant resolves tenants through services/tenancy; single-tenant
  // reaches neither.
  let tenantResolver;
  let tenancyClient;
  if (config.tenancy_mode === "multi") {
    const tenancyConfig = await createServiceConfig("tenancy");
    tenancyClient = new TenancyClient(tenancyConfig, runtime, logger, tracer);
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

  // Multi-tenant `/onboard` accepts only a cryptographically proven Entra `tid`.
  // The verifier wraps the same Bot Framework authenticator the `/api/messages`
  // path uses (one SDK validation path), so a forged or absent proof is rejected
  // with 401 and a proven `tid` transitions the tenant `active` and maps its
  // repo. Single-tenant deployments never mount `/onboard`, so no verifier is
  // built.
  let authenticateTenant;
  if (config.tenancy_mode === "multi") {
    authenticateTenant = createOnboardVerifier(
      createBotFrameworkAuthentication(config),
    );
  }

  const service = new MsBridgeService(config, {
    logger,
    tracer,
    discussionClient,
    ghuserClient,
    tenantResolver,
    tenancyClient,
    authenticateTenant,
    clock,
    trustedOrigins,
    ticketSecret: config.link_completion_ticket_secret,
  });
  await service.start();
}

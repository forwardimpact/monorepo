#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";

import { createAppAuth } from "@octokit/auth-app";
import { graphql } from "@octokit/graphql";
import { verify } from "@octokit/webhooks-methods";

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

import { GhBridgeService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcghbridge",
  description: "GitHub Discussions bridge service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("ghbridge", {
    protocol: "http",
    port: 3013,
    github_repo: "",
    callback_base_url: "",
    app_id: "",
    app_private_key: "",
    app_installation_id: "",
    app_webhook_secret: "",
    trusted_idp_origins: "",
    link_completion_ticket_secret: "",
    // "single" (default, self-hosted) reads the App key in-process; "multi"
    // (hosted) resolves the tenant per request and mints tokens through
    // services/ghserver. The data shape does not branch on this flag.
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
  const logger = createLogger("ghbridge", runtime);
  const tracer = await createTracer("ghbridge");

  const trustedOrigins = loadTrustedIdpOrigins(config.trusted_idp_origins, {
    logger,
  });
  assertNonEmpty(trustedOrigins, "trusted_idp_origins (loaded)");

  const { GhuserClient, BridgeClient, TenancyClient, GhserverClient } = clients;

  // Pick the tenant resolver and token source from the deployment mode.
  // Single-tenant builds an in-process App-key closure from the static
  // installation id; multi-tenant mints repo-scoped tokens through
  // services/ghserver and resolves tenants through services/tenancy.
  let tenantResolver;
  let ghserverClient;
  let tenancyClient;
  if (config.tenancy_mode === "multi") {
    const tenancyConfig = await createServiceConfig("tenancy");
    tenancyClient = new TenancyClient(tenancyConfig, runtime, logger, tracer);
    const ghserverConfig = await createServiceConfig("ghserver");
    ghserverClient = new GhserverClient(
      ghserverConfig,
      runtime,
      logger,
      tracer,
    );
    tenantResolver = new RegistryTenantResolver({ client: tenancyClient });
  } else {
    tenantResolver = new DefaultTenantResolver({
      channel: "github-discussions",
      repo: parseRepo(config.github_repo),
    });
  }

  const appAuth =
    config.tenancy_mode === "multi"
      ? null
      : createAppAuth({
          appId: config.app_id,
          privateKey: config.app_private_key,
          installationId: config.app_installation_id,
        });

  /**
   * Derive an installation token for the reply path. Single-tenant uses the
   * in-process App-key closure; multi-tenant mints a repo-scoped token via
   * services/ghserver for the per-request repo.
   *
   * @param {{owner: string, name: string}} [repo]
   * @returns {Promise<string>}
   */
  async function getInstallationToken(repo) {
    if (config.tenancy_mode === "multi") {
      const { installation_token } = await ghserverClient.MintInstallationToken(
        {
          owner: repo.owner,
          name: repo.name,
          requested_by: "ghbridge",
        },
      );
      return installation_token;
    }
    const { token } = await appAuth({ type: "installation" });
    return token;
  }

  /**
   * Build a GraphQL client bound to a specific repository's installation
   * token. Single-tenant callers pass the static `config.github_repo`;
   * multi-tenant callers pass the per-request resolved tenant repo so the
   * reply/reaction path authenticates as the App installation on the
   * customer's repository, not an empty static repo.
   *
   * @param {{owner: string, name: string}} [repo]
   * @returns {(query: string, variables: object) => Promise<unknown>}
   */
  function makeGraphqlClient(repo) {
    return async (query, variables) => {
      const token = await getInstallationToken(repo);
      return graphql(query, {
        ...variables,
        headers: { authorization: `Bearer ${token}` },
      });
    };
  }

  // Single-tenant default client, bound to the static configured repo. In
  // multi-tenant mode the bridge builds a per-request client from the resolved
  // tenant repo via `makeGraphqlClient`.
  const graphqlClient = makeGraphqlClient(parseRepo(config.github_repo));

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

  const service = new GhBridgeService(config, {
    logger,
    tracer,
    discussionClient,
    verifyWebhook: verify,
    getInstallationToken,
    graphqlClient,
    makeGraphqlClient,
    ghuserClient,
    tenantResolver,
    tenancyClient,
    clock,
    trustedOrigins,
    ticketSecret: config.link_completion_ticket_secret,
  });

  await service.start();
}

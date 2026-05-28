#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createAppAuth } from "@octokit/auth-app";
import { graphql } from "@octokit/graphql";
import { verify } from "@octokit/webhooks-methods";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { GhBridgeService } from "./index.js";

const config = await createServiceConfig("ghbridge", {
  github_repo: "",
  callback_base_url: "",
  app_id: "",
  app_private_key: "",
  app_installation_id: "",
  app_webhook_secret: "",
});
const logger = createLogger("ghbridge");
const tracer = await createTracer("ghbridge");

const appAuth = createAppAuth({
  appId: config.app_id,
  privateKey: config.app_private_key,
  installationId: config.app_installation_id,
});
async function getInstallationToken() {
  const { token } = await appAuth({ type: "installation" });
  return token;
}

const graphqlClient = async (query, variables) => {
  const token = await getInstallationToken();
  return graphql(query, {
    ...variables,
    headers: { authorization: `Bearer ${token}` },
  });
};

const { GhauthClient, BridgeClient } = clients;
const ghauthConfig = await createServiceConfig("ghauth");
const ghauthClient = new GhauthClient(ghauthConfig, logger, tracer);
const bridgeConfig = await createServiceConfig("bridge");
const discussionClient = new BridgeClient(bridgeConfig, logger, tracer);

const service = new GhBridgeService(config, {
  logger,
  tracer,
  discussionClient,
  verifyWebhook: verify,
  getInstallationToken,
  graphqlClient,
  ghauthClient,
});

await service.start();

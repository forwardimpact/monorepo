#!/usr/bin/env node
import { createAppAuth } from "@octokit/auth-app";
import { graphql } from "@octokit/graphql";
import { verify } from "@octokit/webhooks-methods";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { LocalStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { GhBridgeService } from "./index.js";

const config = await createServiceConfig("ghbridge", {
  protocol: "http",
  port: 8080,
  github_repo: "",
  callback_base_url: "",
  app_id: "",
  app_private_key: "",
  app_installation_id: "",
  app_webhook_secret: "",
});
const logger = createLogger("ghbridge");
const tracer = await createTracer("ghbridge");

const stateRoot = process.env.STATE_DIR ?? "/var/lib/ghbridge";
const storage = new LocalStorage(stateRoot, await import("node:fs/promises"));

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

const service = new GhBridgeService(config, {
  logger,
  tracer,
  storage,
  verifyWebhook: verify,
  getInstallationToken,
  graphqlClient,
});

await service.start();

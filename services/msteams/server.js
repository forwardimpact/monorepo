#!/usr/bin/env node
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { createBridge } from "./index.js";

const config = await createServiceConfig("msteams", {
  protocol: "http",
  port: 3978,
  github_repo: "",
  callback_base_url: "",
});
const logger = createLogger("msteams");

let tracer = null;
try {
  tracer = await createTracer("msteams");
} catch {
  logger.info("server", "trace service unavailable, spans disabled");
}

const bridge = createBridge({
  microsoftAppId: config.msAppId(),
  microsoftAppPassword: config.msAppPassword(),
  microsoftAppTenantId: config.msAppTenantId(),
  githubToken: config.ghToken(),
  githubRepo: config.github_repo,
  callbackBaseUrl: config.callback_base_url,
  port: config.port,
  logger,
  tracer,
});

await bridge.start();

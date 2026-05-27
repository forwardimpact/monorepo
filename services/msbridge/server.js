#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  protocol: "http",
  port: 3009,
  github_repo: "",
  callback_base_url: "",
});
const logger = createLogger("msbridge");
const tracer = await createTracer("msbridge");

const storage = createStorage("bridges/msbridge");

const service = new MsBridgeService(config, { logger, tracer, storage });
await service.start();

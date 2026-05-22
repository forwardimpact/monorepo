#!/usr/bin/env node
import { createServiceConfig } from "@forwardimpact/libconfig";
import { LocalStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { MsBridgeService } from "./index.js";

const config = await createServiceConfig("msbridge", {
  protocol: "http",
  port: 3978,
  github_repo: "",
  callback_base_url: "",
});
const logger = createLogger("msbridge");
const tracer = await createTracer("msbridge");

const stateRoot = process.env.STATE_DIR ?? "/var/lib/msbridge";
const storage = new LocalStorage(stateRoot, await import("node:fs/promises"));

const service = new MsBridgeService(config, { logger, tracer, storage });
await service.start();

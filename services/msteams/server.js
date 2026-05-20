#!/usr/bin/env node
import { createBridge } from "./index.js";

const bridge = createBridge({
  microsoftAppId: process.env.MICROSOFT_APP_ID ?? "",
  microsoftAppPassword: process.env.MICROSOFT_APP_PASSWORD ?? "",
  microsoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? "",
  githubToken: process.env.GH_TOKEN,
  githubRepo: process.env.GITHUB_REPO,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL,
  port: parseInt(process.env.PORT ?? "3978", 10),
});

await bridge.start();

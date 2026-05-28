import { describe, expect, test } from "bun:test";

import {
  createMockConfig,
  createMockLogger,
  createMockDiscussionClient,
  createMockTracer,
} from "@forwardimpact/libmock";

import { GhBridgeService } from "../index.js";

function makeConfig() {
  return createMockConfig("ghbridge", {
    host: "127.0.0.1",
    port: 0,
    github_repo: "owner/repo",
    callback_base_url: "https://bridge.example",
    app_webhook_secret: "secret-long-enough-for-hmac",
  });
}

describe("ghbridge startup", () => {
  test("construction fails when ghauthClient is absent", () => {
    expect(
      () =>
        new GhBridgeService(makeConfig(), {
          logger: createMockLogger(),
          tracer: createMockTracer(),
          discussionClient: createMockDiscussionClient(),
          verifyWebhook: async () => true,
          getInstallationToken: async () => "t",
          graphqlClient: async () => ({}),
        }),
    ).toThrow("ghauthClient is required");
  });
});

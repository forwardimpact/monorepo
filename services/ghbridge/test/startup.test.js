import { describe, expect, test } from "bun:test";

import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libharness";

import { GhBridgeService } from "../index.js";

function makeTracer() {
  const noop = () => {};
  return {
    startSpan: () => ({
      addEvent: noop,
      setOk: noop,
      setError: noop,
      end: async () => {},
    }),
  };
}

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
          tracer: makeTracer(),
          storage: createMockStorage(),
          verifyWebhook: async () => true,
          getInstallationToken: async () => "t",
          graphqlClient: async () => ({}),
        }),
    ).toThrow("ghauthClient is required");
  });
});

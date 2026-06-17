import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import {
  createMockConfig,
  createMockLogger,
  createMockDiscussionClient,
  createMockTracer,
} from "@forwardimpact/libmock";
import {
  DefaultTenantResolver,
  RegistryTenantResolver,
} from "@forwardimpact/libbridge";

import { GhBridgeService } from "../index.js";

const BASE_DEPS = () => ({
  logger: createMockLogger(),
  tracer: createMockTracer(),
  discussionClient: createMockDiscussionClient(),
  verifyWebhook: async () => true,
  getInstallationToken: async () => "t",
  graphqlClient: async () => ({}),
  clock: { now: () => 0 },
  trustedOrigins: new Set(["https://github.com"]),
  ticketSecret: "ghbridge-test-secret",
});

function makeConfig(overrides = {}) {
  return createMockConfig("ghbridge", {
    host: "127.0.0.1",
    port: 0,
    github_repo: "owner/repo",
    callback_base_url: "https://bridge.example",
    app_webhook_secret: "secret-long-enough-for-hmac",
    ...overrides,
  });
}

describe("ghbridge startup", () => {
  test("construction fails when ghuserClient is absent", () => {
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
    ).toThrow("ghuserClient is required");
  });

  test("single-tenant construction uses the default tenant resolver", () => {
    const service = new GhBridgeService(makeConfig(), {
      ...BASE_DEPS(),
      ghuserClient: {},
      tenantResolver: new DefaultTenantResolver({
        channel: "github-discussions",
        repo: { owner: "owner", name: "repo" },
      }),
    });
    expect(service.store).toBeDefined();
  });

  test("multi-tenant construction accepts registry resolver and control-plane clients", () => {
    const tenancyClient = {
      ResolveByChannelKey: async () => null,
      ResolveByRepo: async () => null,
      ResolveByTenantId: async () => null,
      UpsertByPair: async () => ({}),
    };
    const ghserverClient = {
      MintInstallationToken: async () => ({
        installation_token: "minted",
        expires_at: 0,
      }),
    };
    const service = new GhBridgeService(makeConfig({ tenancy_mode: "multi" }), {
      ...BASE_DEPS(),
      ghuserClient: {},
      tenantResolver: new RegistryTenantResolver({ client: tenancyClient }),
      tenancyClient,
      ghserverClient,
    });
    expect(service.store).toBeDefined();
  });
});

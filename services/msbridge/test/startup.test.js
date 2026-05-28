import { describe, expect, test } from "bun:test";

import {
  createMockConfig,
  createMockLogger,
  createMockDiscussionClient,
  createMockTracer,
} from "@forwardimpact/libmock";

import { MsBridgeService } from "../index.js";

function makeConfig() {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
  });
}

function makeAdapter() {
  return {
    sent: [],
    reactionActivities: [],
    process: async (_req, res, callback) => {
      await callback({
        activity: { type: "message" },
        sendActivity: async () => {},
      });
      if (!res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async () => {},
    onTurnError: null,
  };
}

describe("msbridge startup", () => {
  test("construction fails when ghauthClient is absent", () => {
    expect(
      () =>
        new MsBridgeService(makeConfig(), {
          logger: createMockLogger(),
          tracer: createMockTracer(),
          discussionClient: createMockDiscussionClient(),
          adapter: makeAdapter(),
        }),
    ).toThrow("ghauthClient is required");
  });
});

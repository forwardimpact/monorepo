import {
  createMockConfig,
  createMockLogger,
  createMockTracer,
  createMockClock,
} from "@forwardimpact/libmock";

import { MsBridgeService } from "../index.js";
import {
  DEFAULT_TICKET_SECRET,
  DEFAULT_TRUSTED_ORIGINS,
  createStatefulDiscussionClient,
} from "./helpers.js";

/** Build a mock msbridge config with sensible defaults. */
export function makeConfig(overrides = {}) {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ...overrides,
  });
}

/** Build a fake Bot Framework adapter that records sent + reaction activities. */
export function makeAdapter(overrides = {}) {
  const sent = [];
  const reactionActivities = [];
  return {
    sent,
    reactionActivities,
    process: async (_req, res, callback) => {
      const turnContext = {
        activity: overrides.activity ?? { type: "message" },
        sendActivity: async (activity) => {
          sent.push(activity);
        },
      };
      await callback(turnContext);
      if (!res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async (_appId, _ref, callback) => {
      await callback({
        sendActivity: async (activity) => {
          if (
            activity &&
            typeof activity === "object" &&
            activity.type === "messageReaction"
          ) {
            reactionActivities.push(activity);
          } else {
            sent.push(activity);
          }
        },
      });
    },
    onTurnError: null,
    ...overrides,
  };
}

/** Build a fake per-user GitHub token client. */
export function makeGhuserClient(token = "ghs_per_user") {
  return {
    GetToken: async () => ({ result: "token", token }),
  };
}

/** Construct an MsBridgeService with mocked collaborators. */
export function newService({
  adapter,
  config: configOverrides,
  logger,
  ghuserClient,
} = {}) {
  return new MsBridgeService(makeConfig(configOverrides), {
    logger: logger ?? createMockLogger(),
    tracer: createMockTracer(),
    clock: createMockClock(),
    discussionClient: createStatefulDiscussionClient(),
    ghuserClient: ghuserClient ?? makeGhuserClient(),
    adapter: adapter ?? makeAdapter(),
    trustedOrigins: DEFAULT_TRUSTED_ORIGINS,
    ticketSecret: DEFAULT_TICKET_SECRET,
  });
}

import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";
import {
  DEFAULT_CONTRACT,
  IDENTITY_CONTRACTS,
} from "../src/identity-contracts.js";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghuser identity-proof registry", () => {
  test("lookup miss returns proof_missing", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghuser", {
      link_base_url: "http://localhost:3007",
    });
    const clock = createMockClock({ start: Date.now() });
    const flows = new FlowStore(storage, { clock });
    const service = new GhuserService(config, {
      bindings: new BindingStore(storage, { clock }),
      flows,
      grants: new GrantStore(storage, { clock }),
      clock,
      idpOrigin: "https://github.com",
      trustedOrigins: loadTrustedIdpOrigins("https://github.com"),
      ticketSecret: "test-secret",
      bridgeClient: {
        VerifyPendingDispatch: async () => {
          const err = new Error("NOT_FOUND");
          err.code = 5;
          throw err;
        },
      },
      github: {
        authorizeUrl: () => "http://gh",
        exchangeCode: async () => ({}),
        getUser: async () => "u1",
        refresh: async () => ({}),
        revoke: async () => {},
      },
    });

    const result = await service.Begin({
      surface: "slack",
      surface_user_id: "U123",
      client_state: "tok",
    });

    assert.strictEqual(result.outcome, "proof_missing");
    assert.strictEqual(result.state, undefined);
    // No flow row was written.
    await flows.loadData();
    assert.strictEqual(flows.index.size, 0, "no flow row");
  });

  test("registry surface count pins the default-contract invariant", () => {
    assert.strictEqual(IDENTITY_CONTRACTS.size, 1);
    assert.ok(IDENTITY_CONTRACTS.has("github-discussions"));
  });

  test("DEFAULT_CONTRACT evaluatedAt is Begin (fail-fast point)", () => {
    assert.strictEqual(DEFAULT_CONTRACT.evaluatedAt, "Begin");
  });

  test("github_account_equality evaluatedAt is Complete", () => {
    assert.strictEqual(
      IDENTITY_CONTRACTS.get("github-discussions").evaluatedAt,
      "Complete",
    );
  });
});

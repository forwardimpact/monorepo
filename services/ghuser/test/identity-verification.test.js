import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

const TRUSTED = loadTrustedIdpOrigins("https://github.com");

function createService(
  storage,
  {
    getUserId = "12345",
    idpOrigin = "https://github.com",
    bridgeClient = {
      VerifyPendingDispatch: async () => ({}),
    },
    logger,
  } = {},
) {
  const config = createMockConfig("ghuser", {
    link_base_url: "http://localhost:3007",
  });
  const clock = createMockClock({ start: Date.now() });
  const bindings = new BindingStore(storage, { clock });
  return {
    service: new GhuserService(config, {
      bindings,
      flows: new FlowStore(storage, { clock }),
      grants: new GrantStore(storage, { clock }),
      clock,
      idpOrigin,
      trustedOrigins: TRUSTED,
      ticketSecret: "test-secret",
      bridgeClient,
      logger,
      github: {
        authorizeUrl: () => "http://gh/authorize",
        exchangeCode: async () => ({
          access_token: "ghu_test",
          refresh_token: "ghr_test",
          expires_in: 3600,
        }),
        getUser: async () => getUserId,
        refresh: async () => ({}),
        revoke: async () => {},
      },
    }),
    bindings,
  };
}

describe("ghuser identity verification", () => {
  test("bridge-proof surface with no pending entry returns proof_missing", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      bridgeClient: {
        VerifyPendingDispatch: async () => {
          const err = new Error("NOT_FOUND");
          err.code = 5;
          throw err;
        },
      },
    });

    const result = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-victim",
      client_state: "forged-token",
    });

    assert.strictEqual(result.outcome, "proof_missing");
    assert.strictEqual(result.state, undefined);
    const binding = await bindings.loadBinding("msteams", "aad-victim");
    assert.strictEqual(binding, null, "no binding created");
  });

  test("bridge-proof surface with mismatched user returns proof_missing", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      bridgeClient: {
        VerifyPendingDispatch: async () => {
          const err = new Error("FAILED_PRECONDITION");
          err.code = 9;
          throw err;
        },
      },
    });

    const result = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-B",
      client_state: "link-token-xyz",
    });

    assert.strictEqual(result.outcome, "proof_missing");
    const binding = await bindings.loadBinding("msteams", "aad-B");
    assert.strictEqual(binding, null);
  });

  test("bridge-proof surface with valid proof binds exactly once and emits canonical VerifyPendingDispatch shape", async () => {
    const storage = createMockStorage();
    let calls = 0;
    const verifyCalls = [];
    const { service, bindings } = createService(storage, {
      bridgeClient: {
        VerifyPendingDispatch: async (req) => {
          calls += 1;
          verifyCalls.push(req);
          if (calls === 1) return {};
          const err = new Error("FAILED_PRECONDITION");
          err.code = 9;
          throw err;
        },
      },
    });

    const first = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-victim",
      client_state: "link-token-xyz",
      tenant_id: "default",
    });
    assert.ok(first.state, "first Begin returns state");
    const completion = await service.Complete({
      code: "code1",
      state: first.state,
    });
    assert.strictEqual(completion.outcome, undefined);
    const binding = await bindings.loadBinding("msteams", "aad-victim");
    assert.ok(binding, "binding written on first valid proof");

    const second = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-victim",
      client_state: "link-token-xyz",
      tenant_id: "default",
    });
    assert.strictEqual(second.outcome, "proof_missing");
    assert.strictEqual(calls, 2, "both Begin calls reached bridge");

    // Pin the canonical request shape against `services/bridge`
    // `requireTenant` (rejects empty `tenant_id`) and `scopedKey =
    // ${tenant_id}:${link_token}` (must match msbridge's `default`
    // tenant write). A regression to `tenant_id: ""` would 1) flip
    // both Begin calls to `proof_missing` in production while still
    // passing this suite without the assertion, and 2) silently
    // break msteams linking on the structural-fix tag.
    assert.deepStrictEqual(verifyCalls[0], {
      link_token: "link-token-xyz",
      expected_surface: "msteams",
      expected_surface_user_id: "aad-victim",
      tenant_id: "default",
    });
  });

  test("bridge-proof keys VerifyPendingDispatch on the resolved tenant, not a literal", async () => {
    const storage = createMockStorage();
    const verifyCalls = [];
    const { service } = createService(storage, {
      bridgeClient: {
        VerifyPendingDispatch: async (req) => {
          verifyCalls.push(req);
          return {};
        },
      },
    });

    await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-victim",
      client_state: "link-token-xyz",
      tenant_id: "tenant-b",
    });

    // The proof must be scoped to the tenant carried in on Begin (criterion
    // 3); a regression to a hard-coded literal fails this assertion.
    assert.deepStrictEqual(verifyCalls[0], {
      link_token: "link-token-xyz",
      expected_surface: "msteams",
      expected_surface_user_id: "aad-victim",
      tenant_id: "tenant-b",
    });
  });

  test("bridge transport error fails closed and emits operator debug crumb", async () => {
    const storage = createMockStorage();
    const debugCalls = [];
    const logger = {
      debug: (...args) => debugCalls.push(args),
    };
    const { service, bindings } = createService(storage, {
      bridgeClient: {
        VerifyPendingDispatch: async () => {
          throw new Error("network unreachable");
        },
      },
      logger,
    });

    const result = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-victim",
      client_state: "any-token",
    });

    assert.strictEqual(result.outcome, "proof_missing");
    const binding = await bindings.loadBinding("msteams", "aad-victim");
    assert.strictEqual(binding, null);
    assert.strictEqual(debugCalls.length, 1, "one debug crumb emitted");
    assert.deepStrictEqual(debugCalls[0], [
      "identity-contract",
      "proof_missing",
      { surface: "msteams", reason: "network unreachable" },
    ]);
  });

  test("github-discussions matching id binds", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      getUserId: "42",
    });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, undefined);
    const binding = await bindings.loadBinding("github-discussions", "42");
    assert.ok(binding, "binding was created");
    assert.strictEqual(binding.github_user_id, "42");
  });

  test("github-discussions mismatched id returns identity_mismatch", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      getUserId: "999",
    });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, "identity_mismatch");
    const binding = await bindings.loadBinding("github-discussions", "42");
    assert.strictEqual(binding, null, "no binding created");
  });

  test("client_state round-trip carried through to completion", async () => {
    const storage = createMockStorage();
    const { service } = createService(storage, { getUserId: "42" });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
      client_state: "tok-abc",
      redirect_uri: "http://bridge/api/link-complete",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.client_state, "tok-abc");
  });
});

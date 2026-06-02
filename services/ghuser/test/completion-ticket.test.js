import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import {
  TICKET_TTL_MS,
  verifyCompletionTicket,
} from "@forwardimpact/libutil/completion-ticket";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REDIRECT = "http://bridge/api/link-complete";
const LINK_TOKEN = "link-token-xyz";

function build(
  storage,
  {
    idpOrigin = "https://github.com",
    trustedOriginsRaw = "https://github.com",
    ticketSecret = SECRET,
    getUserId = "42",
    surface = "github-discussions",
    upsertSpy = () => {},
  } = {},
) {
  const config = createMockConfig("ghuser", {
    link_base_url: "http://localhost:3007",
  });
  const clock = createMockClock({ start: 1_700_000_000_000 });
  const bindings = new BindingStore(storage, { clock });

  let upsertCount = 0;
  const wrappedBindings = new Proxy(bindings, {
    get(target, prop, receiver) {
      if (prop === "upsert") {
        return async (b) => {
          upsertCount += 1;
          upsertSpy(b);
          return target.upsert.call(target, b);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const service = new GhuserService(config, {
    bindings: wrappedBindings,
    flows: new FlowStore(storage, { clock }),
    grants: new GrantStore(storage, { clock }),
    clock,
    idpOrigin,
    trustedOrigins: loadTrustedIdpOrigins(trustedOriginsRaw),
    ticketSecret,
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
  });
  return {
    service,
    clock,
    getUpsertCount: () => upsertCount,
    surface,
    config,
  };
}

describe("ghuser Complete — origin check + ticket mint", () => {
  test("untrusted idp_origin returns untrusted_origin and does not upsert binding", async () => {
    const storage = createMockStorage();
    const { service, getUpsertCount } = build(storage, {
      idpOrigin: "https://github.com",
      trustedOriginsRaw: "https://other.example",
      getUserId: "42",
    });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, "untrusted_origin");
    assert.strictEqual(getUpsertCount(), 0);
  });

  test("successful complete returns a verifiable completion_ticket", async () => {
    const storage = createMockStorage();
    const { service, clock } = build(storage);

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
      client_state: LINK_TOKEN,
      redirect_uri: REDIRECT,
    });
    const nowAtComplete = clock.now();
    const result = await service.Complete({ code: "code1", state });

    assert.ok(result.completion_ticket, "ticket present");
    const v = verifyCompletionTicket({
      ticket: result.completion_ticket,
      expected: { linkToken: LINK_TOKEN },
      trustedOrigins: loadTrustedIdpOrigins("https://github.com"),
      secret: SECRET,
      now: nowAtComplete + 1,
    });
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.claims.linkToken, LINK_TOKEN);
    assert.strictEqual(v.claims.surfaceUserId, "42");
    assert.strictEqual(v.claims.idpOrigin, "https://github.com");
    assert.strictEqual(v.claims.exp, nowAtComplete + TICKET_TTL_MS);
  });

  test("idp_origin invariance: request-controlled inputs never influence the ticket origin", async () => {
    for (const params of [
      { code: "https://attacker.example/code" },
      { redirect: "https://attacker.example" },
    ]) {
      const storage = createMockStorage();
      const { service } = build(storage);

      const { state } = await service.Begin({
        surface: "github-discussions",
        surface_user_id: "42",
        client_state: LINK_TOKEN,
        redirect_uri: params.redirect ?? REDIRECT,
      });
      const result = await service.Complete({
        code: params.code ?? "code1",
        state,
      });

      assert.ok(result.completion_ticket);
      const v = verifyCompletionTicket({
        ticket: result.completion_ticket,
        expected: { linkToken: LINK_TOKEN },
        trustedOrigins: loadTrustedIdpOrigins("https://github.com"),
        secret: SECRET,
        now: 1_700_000_000_000 + 1000,
      });
      assert.strictEqual(v.ok, true);
      assert.strictEqual(v.claims.idpOrigin, "https://github.com");
    }
  });

  test("HMAC secret rotation: minting with secret A, verifying with secret B fails as bad_signature", async () => {
    const storage = createMockStorage();
    const { service, clock } = build(storage, { ticketSecret: "secret-A" });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
      client_state: LINK_TOKEN,
      redirect_uri: REDIRECT,
    });
    const result = await service.Complete({ code: "code1", state });

    const v = verifyCompletionTicket({
      ticket: result.completion_ticket,
      expected: { linkToken: LINK_TOKEN },
      trustedOrigins: loadTrustedIdpOrigins("https://github.com"),
      secret: "secret-B",
      now: clock.now() + 1,
    });
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, "bad_signature");
  });
});

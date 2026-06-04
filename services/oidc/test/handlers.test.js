import { test, describe } from "node:test";
import assert from "node:assert";
import { Hono } from "hono";
import grpc from "@grpc/grpc-js";
import { registerTokenRoute, OidcError } from "../index.js";

const GOOD_CLAIMS = {
  owner: "acme",
  name: "agents",
  repository: "acme/agents",
};

function buildApp({ validate, mint }) {
  const app = new Hono();
  registerTokenRoute(app, {
    validator: { validate },
    providerClient: { MintInstallationToken: mint },
    typed: (_name, obj) => obj,
  });
  return app;
}

const okValidate = async () => GOOD_CLAIMS;
const okMint = async () => ({ installation_token: "ghs_x", expires_at: 999 });

function post(app, headers = { authorization: "bearer tok" }) {
  return app.request("/token", { method: "POST", headers });
}

describe("oidc POST /token", () => {
  test("happy path returns the minted installation token", async () => {
    const app = buildApp({ validate: okValidate, mint: okMint });
    const res = await post(app);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), {
      installation_token: "ghs_x",
      expires_at: 999,
    });
  });

  test("missing bearer → 401", async () => {
    const app = buildApp({ validate: okValidate, mint: okMint });
    const res = await post(app, {});
    assert.strictEqual(res.status, 401);
  });

  test("accepts a case-insensitive Bearer scheme", async () => {
    const app = buildApp({ validate: okValidate, mint: okMint });
    const res = await post(app, { authorization: "Bearer tok" });
    assert.strictEqual(res.status, 200);
  });

  for (const [code, status] of [
    ["INVALID_SIGNATURE", 401],
    ["EXPIRED", 401],
    ["WRONG_ISSUER", 403],
    ["WRONG_AUDIENCE", 403],
    ["MISSING_REPOSITORY_CLAIM", 400],
  ]) {
    test(`validator ${code} → ${status}`, async () => {
      const app = buildApp({
        validate: async () => {
          throw new OidcError(code);
        },
        mint: okMint,
      });
      const res = await post(app);
      assert.strictEqual(res.status, status);
      assert.deepStrictEqual(await res.json(), { error: code });
    });
  }

  test("provider NOT_FOUND → 404", async () => {
    const app = buildApp({
      validate: okValidate,
      mint: async () => {
        const e = new Error("nope");
        e.code = grpc.status.NOT_FOUND;
        throw e;
      },
    });
    const res = await post(app);
    assert.strictEqual(res.status, 404);
  });

  test("provider RESOURCE_EXHAUSTED → 429", async () => {
    const app = buildApp({
      validate: okValidate,
      mint: async () => {
        const e = new Error("slow down");
        e.code = grpc.status.RESOURCE_EXHAUSTED;
        throw e;
      },
    });
    const res = await post(app);
    assert.strictEqual(res.status, 429);
  });
});

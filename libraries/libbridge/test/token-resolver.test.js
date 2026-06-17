import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { TokenResolver } from "../src/token-resolver.js";

function mockClient(impl) {
  return { GetToken: impl };
}

describe("TokenResolver", () => {
  test("rejects construction without a client", () => {
    expect(() => new TokenResolver()).toThrow("ghuser client is required");
    expect(() => new TokenResolver(null)).toThrow("ghuser client is required");
  });

  test("token arm returns kind=token", async () => {
    const resolver = new TokenResolver(
      mockClient(async () => ({ result: "token", token: "ghs_x" })),
    );
    const auth = await resolver.resolve("msteams", "U_1");
    expect(auth).toEqual({ kind: "token", token: "ghs_x" });
  });

  test("link_required arm returns kind=link_required with authorizeUrl", async () => {
    const resolver = new TokenResolver(
      mockClient(async () => ({
        result: "link_required",
        link_required: { authorize_url: "https://example.com/authorize" },
      })),
    );
    const auth = await resolver.resolve("msteams", "U_2");
    expect(auth).toEqual({
      kind: "link_required",
      authorizeUrl: "https://example.com/authorize",
    });
  });

  test("re_auth_required arm returns kind=reauth_required", async () => {
    const resolver = new TokenResolver(
      mockClient(async () => ({
        result: "re_auth_required",
        re_auth_required: {},
      })),
    );
    const auth = await resolver.resolve("msteams", "U_3");
    expect(auth).toEqual({ kind: "reauth_required" });
  });

  test("gRPC error folds into kind=transient", async () => {
    const resolver = new TokenResolver(
      mockClient(async () => {
        throw new Error("UNAVAILABLE");
      }),
    );
    const auth = await resolver.resolve("msteams", "U_4");
    expect(auth.kind).toBe("transient");
    expect(auth.error.message).toBe("UNAVAILABLE");
  });

  test("unexpected result arm folds into kind=transient", async () => {
    const resolver = new TokenResolver(
      mockClient(async () => ({ result: "unknown_arm" })),
    );
    const auth = await resolver.resolve("msteams", "U_5");
    expect(auth.kind).toBe("transient");
    expect(auth.error.message).toBe("unexpected GetToken result");
  });

  test("passes surface and surfaceUserId to the client", async () => {
    let captured;
    const resolver = new TokenResolver(
      mockClient(async (req) => {
        captured = req;
        return { result: "token", token: "t" };
      }),
    );
    await resolver.resolve("github-discussions", "42");
    expect(captured.surface).toBe("github-discussions");
    expect(captured.surface_user_id).toBe("42");
  });
});

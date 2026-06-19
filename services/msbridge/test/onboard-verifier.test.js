import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";

import { createOnboardVerifier } from "../src/onboard-verifier.js";

/**
 * Context stub mirroring the Hono request surface the verifier reads:
 * a case-insensitive `req.header(name)` returning the Authorization value.
 */
function fakeContext(authHeader) {
  return {
    req: {
      header: (name) =>
        name.toLowerCase() === "authorization" ? authHeader : undefined,
    },
  };
}

/**
 * Bot Framework authenticator stub. `authenticateChannelRequest` returns a
 * `ClaimsIdentity`-shaped object on success, or throws to model a forged /
 * expired / wrong-audience token.
 */
function fakeAuth({ tid, isAuthenticated = true, throws = false } = {}) {
  return {
    calls: [],
    authenticateChannelRequest(authHeader) {
      this.calls.push(authHeader);
      if (throws) throw new Error("token validation failed");
      return Promise.resolve({
        isAuthenticated,
        getClaimValue: (claim) => (claim === "tid" ? tid : null),
      });
    },
  };
}

describe("msbridge onboard verifier", () => {
  test("constructor requires a Bot Framework authenticator", () => {
    expect(() => createOnboardVerifier(undefined)).toThrow(
      "authenticateChannelRequest is required",
    );
    expect(() => createOnboardVerifier({})).toThrow(
      "authenticateChannelRequest is required",
    );
  });

  test("a proven token resolves to its Entra tid", async () => {
    const auth = fakeAuth({ tid: "entra-acme" });
    const verify = createOnboardVerifier(auth);
    const tid = await verify(fakeContext("Bearer proven.jwt"));
    expect(tid).toBe("entra-acme");
    expect(auth.calls).toEqual(["Bearer proven.jwt"]);
  });

  test("a forged token (validation throws) resolves to null", async () => {
    const verify = createOnboardVerifier(fakeAuth({ throws: true }));
    expect(await verify(fakeContext("Bearer forged.jwt"))).toBeNull();
  });

  test("an unauthenticated identity resolves to null", async () => {
    const verify = createOnboardVerifier(
      fakeAuth({ tid: "entra-acme", isAuthenticated: false }),
    );
    expect(await verify(fakeContext("Bearer weak.jwt"))).toBeNull();
  });

  test("an identity with no tid claim resolves to null", async () => {
    const verify = createOnboardVerifier(fakeAuth({ tid: null }));
    expect(await verify(fakeContext("Bearer notid.jwt"))).toBeNull();
  });

  test("an absent Authorization header resolves to null without calling the SDK", async () => {
    const auth = fakeAuth({ tid: "entra-acme" });
    const verify = createOnboardVerifier(auth);
    expect(await verify(fakeContext(undefined))).toBeNull();
    expect(await verify(fakeContext(""))).toBeNull();
    expect(auth.calls).toEqual([]);
  });
});

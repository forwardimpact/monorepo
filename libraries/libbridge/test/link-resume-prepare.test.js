import { describe, expect, test } from "bun:test";

import { prepareLinkResume } from "../src/link-resume.js";
import { TRUSTED } from "./link-resume-helpers.js";

describe("prepareLinkResume — keyword args, discriminated return", () => {
  test("returns { linkToken, augmentedUrl } for a trusted, parseable URL", () => {
    const r = prepareLinkResume({
      authorizeUrl:
        "https://oauth.example/authorize?surface=github-discussions&surface_user_id=42",
      callbackBaseUrl: "https://bridge.example/",
      trustedOrigins: TRUSTED,
    });
    expect(r.skipped).toBeUndefined();
    const url = new URL(r.augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
    expect(url.searchParams.get("client_state")).toBe(r.linkToken);
    expect(typeof r.linkToken).toBe("string");
    expect(r.linkToken.length).toBeGreaterThan(0);
  });

  test("produces unique tokens on successive calls", () => {
    const a = prepareLinkResume({
      authorizeUrl: "https://oauth.example/a",
      callbackBaseUrl: "https://b",
      trustedOrigins: TRUSTED,
    });
    const b = prepareLinkResume({
      authorizeUrl: "https://oauth.example/a",
      callbackBaseUrl: "https://b",
      trustedOrigins: TRUSTED,
    });
    expect(a.linkToken).not.toBe(b.linkToken);
  });

  test("strips trailing slash from callbackBaseUrl", () => {
    const { augmentedUrl } = prepareLinkResume({
      authorizeUrl: "https://oauth.example/authorize",
      callbackBaseUrl: "https://bridge.example///",
      trustedOrigins: TRUSTED,
    });
    const url = new URL(augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
  });

  test("untrusted origin → { skipped, reason: 'untrusted_origin' }", () => {
    const r = prepareLinkResume({
      authorizeUrl: "https://attacker.example/login",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r).toEqual({ skipped: true, reason: "untrusted_origin" });
  });

  test("malformed URL → { skipped, reason: 'untrusted_origin' }", () => {
    const r = prepareLinkResume({
      authorizeUrl: "not-a-url",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r).toEqual({ skipped: true, reason: "untrusted_origin" });
  });

  test("missing trustedOrigins throws TypeError (forget-resistance)", () => {
    expect(() =>
      prepareLinkResume({
        authorizeUrl: "https://oauth.example/a",
        callbackBaseUrl: "https://b",
      }),
    ).toThrow(TypeError);
  });

  test("non-Set trustedOrigins throws TypeError", () => {
    expect(() =>
      prepareLinkResume({
        authorizeUrl: "https://oauth.example/a",
        callbackBaseUrl: "https://b",
        trustedOrigins: ["https://oauth.example"],
      }),
    ).toThrow(TypeError);
  });
});

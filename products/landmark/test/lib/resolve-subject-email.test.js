/**
 * Subject defaulting for subject-scoped commands: explicit --email wins,
 * the signed-in identity fills when omitted, and the error names the
 * sign-in path when both are absent.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveSubjectEmail } from "../../src/lib/identity.js";

describe("resolveSubjectEmail", () => {
  it("prefers an explicit --email over the identity", () => {
    const email = resolveSubjectEmail(
      { email: "explicit@example.com" },
      { email: "identity@example.com" },
    );
    assert.equal(email, "explicit@example.com");
  });

  it("fills from the signed-in identity when --email is omitted", () => {
    const email = resolveSubjectEmail({}, { email: "identity@example.com" });
    assert.equal(email, "identity@example.com");
  });

  it("throws with the sign-in hint when both are absent", () => {
    assert.throws(
      () => resolveSubjectEmail({}, null),
      /--email <email> is required.*fit-landmark login/,
    );
  });
});

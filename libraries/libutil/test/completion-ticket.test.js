import { describe, test } from "node:test";
import assert from "node:assert";

import {
  TICKET_TTL_MS,
  mintCompletionTicket,
  verifyCompletionTicket,
} from "../src/completion-ticket.js";
import { loadTrustedIdpOrigins } from "../src/trusted-origins.js";

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = 1_700_000_000_000;
const LINK = "link-token-abc";
const SUID = "user-42";
const IDP = "https://github.com";
const TRUSTED = loadTrustedIdpOrigins("https://github.com");

function mint(over = {}) {
  return mintCompletionTicket({
    linkToken: LINK,
    surfaceUserId: SUID,
    idpOrigin: IDP,
    secret: SECRET,
    now: NOW,
    ...over,
  });
}

function verify(ticket, over = {}) {
  return verifyCompletionTicket({
    ticket,
    expected: { linkToken: LINK },
    trustedOrigins: TRUSTED,
    secret: SECRET,
    now: NOW + 1000,
    ...over,
  });
}

describe("mintCompletionTicket / verifyCompletionTicket", () => {
  test("mint+verify round-trips with full claims", () => {
    const t = mint();
    const r = verify(t);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.claims, {
      linkToken: LINK,
      surfaceUserId: SUID,
      idpOrigin: IDP,
      exp: NOW + TICKET_TTL_MS,
    });
  });

  test("signature tamper rejects as bad_signature", () => {
    const t = mint();
    const [payload, sig] = t.split(".");
    const flippedByte = sig[5] === "A" ? "B" : "A";
    const tampered = `${payload}.${sig.slice(0, 5)}${flippedByte}${sig.slice(6)}`;
    const r = verify(tampered);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "bad_signature");
  });

  test("payload tamper invalidates the signature (bad_signature)", () => {
    const t = mint();
    const [payload, sig] = t.split(".");
    const flipped = payload[3] === "A" ? "B" : "A";
    const tampered = `${payload.slice(0, 3)}${flipped}${payload.slice(4)}.${sig}`;
    const r = verify(tampered);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "bad_signature");
  });

  test("now > exp rejects as expired", () => {
    const t = mint();
    const r = verify(t, { now: NOW + TICKET_TTL_MS + 1 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "expired");
  });

  test("cross-token replay rejects as link_token_mismatch", () => {
    const ticketForA = mintCompletionTicket({
      linkToken: "token-A",
      surfaceUserId: SUID,
      idpOrigin: IDP,
      secret: SECRET,
      now: NOW,
    });
    const r = verifyCompletionTicket({
      ticket: ticketForA,
      expected: { linkToken: "token-B" },
      trustedOrigins: TRUSTED,
      secret: SECRET,
      now: NOW + 1000,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "link_token_mismatch");
  });

  test("idp_origin outside trustedOrigins rejects as untrusted_origin", () => {
    const t = mintCompletionTicket({
      linkToken: LINK,
      surfaceUserId: SUID,
      idpOrigin: "https://attacker.example",
      secret: SECRET,
      now: NOW,
    });
    const r = verify(t);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "untrusted_origin");
  });

  test("malformed ticket without a dot rejects as malformed", () => {
    const r = verify("nodot");
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "malformed");
  });

  test("malformed ticket with empty payload rejects as malformed", () => {
    const r = verify(".sig");
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "malformed");
  });

  test("canonical-JSON: minting twice with the same inputs is byte-identical", () => {
    const a = mintCompletionTicket({
      surfaceUserId: SUID,
      linkToken: LINK,
      idpOrigin: IDP,
      secret: SECRET,
      now: NOW,
    });
    const b = mintCompletionTicket({
      idpOrigin: IDP,
      linkToken: LINK,
      surfaceUserId: SUID,
      secret: SECRET,
      now: NOW,
    });
    assert.strictEqual(a, b);
  });

  test("timingSafeEqual path: equal-length signatures with one non-leading byte differing reject as bad_signature", () => {
    const t = mint();
    const [payload, sig] = t.split(".");
    const idx = Math.floor(sig.length / 2);
    const flipped = sig[idx] === "A" ? "B" : "A";
    const tampered = `${payload}.${sig.slice(0, idx)}${flipped}${sig.slice(idx + 1)}`;
    assert.strictEqual(tampered.length, t.length);
    const r = verify(tampered);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "bad_signature");
  });

  test("non-string ticket rejects as malformed", () => {
    const r = verify(null);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "malformed");
  });
});

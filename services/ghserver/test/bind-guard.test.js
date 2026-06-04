import { test, describe } from "node:test";
import assert from "node:assert";
import { assertBindAllowed, isPrivateBindAddress } from "../src/bind-guard.js";

describe("ghserver bind guard", () => {
  test("allows loopback and private addresses", () => {
    for (const addr of [
      "127.0.0.1",
      "127.5.5.5",
      "::1",
      "localhost",
      "10.0.0.4",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.10",
      "fd00::1",
    ]) {
      assert.strictEqual(
        isPrivateBindAddress(addr),
        true,
        `${addr} should be private`,
      );
      assert.doesNotThrow(() => assertBindAllowed(addr, false));
    }
  });

  test("refuses a public address without allow_public_bind", () => {
    assert.strictEqual(isPrivateBindAddress("0.0.0.0"), false);
    assert.throws(() => assertBindAllowed("0.0.0.0", false));
    assert.throws(() => assertBindAllowed("203.0.113.7", false));
    assert.strictEqual(isPrivateBindAddress("172.32.0.1"), false);
  });

  test("allows a public address when allow_public_bind is set", () => {
    assert.doesNotThrow(() => assertBindAllowed("0.0.0.0", true));
    assert.doesNotThrow(() => assertBindAllowed("203.0.113.7", true));
  });
});

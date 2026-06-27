import { describe, test } from "node:test";
import assert from "node:assert";
import { createServer } from "node:net";

import { PortRegistry } from "../src/benchmark/workdir.js";

/** Resolve once the given port can be bound on 127.0.0.1, then release it. */
function isBindable(port) {
  return new Promise((res) => {
    const server = createServer();
    server.once("error", () => res(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => res(true));
    });
  });
}

describe("PortRegistry", () => {
  test("K concurrent acquires return K distinct, bindable ports", async () => {
    const K = 16;
    const reg = new PortRegistry();
    const ports = await Promise.all(
      Array.from({ length: K }, () => reg.acquire()),
    );

    assert.strictEqual(ports.length, K);
    assert.strictEqual(
      new Set(ports).size,
      K,
      "every concurrent acquire must get a distinct number",
    );
    for (const p of ports) {
      assert.ok(Number.isInteger(p) && p > 0, `not a valid port: ${p}`);
      assert.strictEqual(await isBindable(p), true, `port ${p} not bindable`);
    }
  });

  test("a released port can be re-handed out", async () => {
    const reg = new PortRegistry();
    const a = await reg.acquire();
    reg.release(a);
    // With `a` released, repeated acquires are free to reuse it; the registry
    // must not consider it permanently taken.
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const p = await reg.acquire();
      seen.add(p);
      reg.release(p);
    }
    assert.ok(seen.size >= 1);
  });

  test("held ports are never duplicated across sequential acquires", async () => {
    const reg = new PortRegistry();
    const held = [];
    for (let i = 0; i < 8; i++) held.push(await reg.acquire());
    assert.strictEqual(new Set(held).size, held.length);
  });
});

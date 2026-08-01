/**
 * Real-grpc deadline behavior. A unary call can reach a connection that
 * accepts TCP but never speaks HTTP/2. This is the hung-service case. The
 * call must reject with DEADLINE_EXCEEDED in bounded time. It must not
 * wait forever. The test uses a raw net server, so the channel stays
 * CONNECTING until the per-attempt deadline fires.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import net from "node:net";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createRetry } from "@forwardimpact/libutil";
import { createMockObserverFn } from "@forwardimpact/libmock";

import { Client } from "../src/index.js";

describe("Client unary deadline", () => {
  test("hung connection rejects with DEADLINE_EXCEEDED in bounded time", async () => {
    // Accept connections and never respond. Track the sockets so teardown
    // can destroy them. Open handles would otherwise keep the node test
    // runner alive after the assertions pass.
    const sockets = [];
    const server = net.createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    const base = createDefaultRuntime();
    const runtime = {
      ...base,
      proc: {
        ...base.proc,
        env: {
          ...base.proc.env,
          SERVICE_SECRET: "test-secret-test-secret-test-secret",
        },
      },
    };
    const client = new Client(
      { name: "graph", host: "127.0.0.1", port, deadline: 300 },
      runtime,
      null,
      null,
      createMockObserverFn(),
      undefined,
      undefined,
      createRetry({ retries: 0, delay: 1 }),
    );

    const started = Date.now();
    try {
      await assert.rejects(
        () => client.callUnary("GetOntology", {}),
        (err) => err.code === 4, // grpc.status.DEADLINE_EXCEEDED
      );
      assert.ok(
        Date.now() - started < 5000,
        "must fail within the deadline and must not hang",
      );
    } finally {
      client.close();
      for (const socket of sockets) socket.destroy();
      server.close();
    }
  });
});

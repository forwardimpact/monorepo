import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { spy, createMockClock } from "@forwardimpact/libmock";

import { createMcpService } from "../index.js";

/**
 * Integration coverage for the libhttp + MCP-SDK escape hatch: the service
 * mounts on `@forwardimpact/libhttp`, but the StreamableHTTP transport drives
 * the raw Node request/response via `c.env.incoming`/`c.env.outgoing`. These
 * tests start a real server on an ephemeral port and exercise it over HTTP.
 */
function createMockConfig() {
  return {
    host: "127.0.0.1",
    port: 0,
    mcpToken: () => "test-bearer-token",
    system_prompt: "You are Guide, a test agent.",
    tools: {},
  };
}

describe("MCP HTTP transport", () => {
  let service;
  let baseUrl;

  before(async () => {
    service = createMcpService({
      config: createMockConfig(),
      logger: { info: spy(), error: spy() },
      graphClient: {},
      vectorClient: {},
      pathwayClient: {},
      clock: createMockClock({ start: Date.now() }),
    });
    await service.start();
    baseUrl = `http://127.0.0.1:${service.address().port}`;
  });

  after(async () => {
    await service.stop();
  });

  test("GET /health is served by libhttp without auth", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  });

  test("requests without a bearer token are rejected with 401", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "POST" });
    assert.strictEqual(res.status, 401);
  });

  test("an authorized initialize handshake establishes a session", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-bearer-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      }),
    });
    // The SDK transport drove the raw response: a session id is minted and the
    // status is a non-error 2xx (proving the escape hatch wiring works).
    assert.ok(res.status >= 200 && res.status < 300, `status ${res.status}`);
    assert.ok(
      res.headers.get("mcp-session-id"),
      "expected an mcp-session-id header",
    );
    // Drain the body so the connection can close cleanly.
    await res.text();
  });
});

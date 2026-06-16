import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";

import { createMockFs } from "@forwardimpact/libmock";

import { runCallbackCommand } from "../src/commands/callback.js";

const TRACE_PATH = "/callback/trace.ndjson";

/**
 * Invoke the callback handler with an InvocationContext-shaped object backed
 * by an in-memory fs (the trace file is read via `runtime.fsSync`).
 */
function callback(values, fsSync = createMockFs()) {
  return runCallbackCommand({
    options: values,
    deps: { runtime: { fsSync } },
  });
}

// Some sibling test files (libstorage-utils.test.js) mock global.fetch and
// do not restore it. When bun runs files in the same process, the mock
// leaks into our tests. Snapshot the real fetch at module load and pin it
// before each describe.
const REAL_FETCH = globalThis.fetch.bind(globalThis);

/**
 * Start a one-shot HTTP server that records the first request and returns
 * the configured status. Returns the URL, a getter for the captured
 * request, and a close() helper.
 */
function startServer(status = 200) {
  return new Promise((resolve) => {
    /** @type {{method: string, url: string, body: any} | null} */
    let lastRequest = null;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        lastRequest = {
          method: req.method,
          url: req.url,
          body: body ? JSON.parse(body) : null,
        };
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: status < 400 }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        getLastRequest: () => lastRequest,
        close: () =>
          new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

function writeTrace(records) {
  const body = `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
  return {
    tracePath: TRACE_PATH,
    fsSync: createMockFs({ [TRACE_PATH]: body }),
  };
}

describe("fit-eval callback", () => {
  beforeEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  test("extracts the orchestrator summary and POSTs it to the callback URL", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      { source: "agent", seq: 0, event: { type: "start" } },
      {
        source: "orchestrator",
        seq: 1,
        event: {
          type: "summary",
          verdict: "success",
          summary: "Routed to staff-engineer.",
          turns: 7,
        },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/abc`,
          "correlation-id": "corr-123",
          "run-url": "https://github.com/foo/bar/actions/runs/42",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.method, "POST");
      assert.strictEqual(req.url, "/api/callback/abc");
      assert.deepStrictEqual(req.body, {
        correlation_id: "corr-123",
        kind: "terminal",
        verdict: "success",
        summary: "Routed to staff-engineer.",
        run_url: "https://github.com/foo/bar/actions/runs/42",
        cost_usd: 0,
        replies: [],
        last_acted_seq: -1,
      });
    } finally {
      await server.close();
    }
  });

  test("uses the most recent summary event when multiple appear", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", verdict: "failure", summary: "first" },
      },
      {
        source: "orchestrator",
        seq: 2,
        event: { type: "summary", verdict: "success", summary: "final" },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/multi`,
          "correlation-id": "m",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "success");
      assert.strictEqual(req.body.summary, "final");
      assert.strictEqual(req.body.run_url, "");
    } finally {
      await server.close();
    }
  });

  test("posts failure fallback when no orchestrator summary event is present", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      { source: "agent", seq: 0, event: { type: "start" } },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": server.url,
          "correlation-id": "x",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "failed");
      assert.ok(req.body.summary.length > 0);
      assert.strictEqual(req.body.correlation_id, "x");
      assert.deepStrictEqual(req.body.replies, []);
    } finally {
      await server.close();
    }
  });

  test("sums cost_usd across every participant's result events", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "agent",
        seq: 0,
        event: { type: "result", total_cost_usd: 0.02 },
      },
      {
        source: "supervisor",
        seq: 1,
        event: { type: "result", total_cost_usd: 0.05 },
      },
      {
        source: "orchestrator",
        seq: 2,
        event: { type: "summary", verdict: "success", summary: "done" },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/cost`,
          "correlation-id": "c",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.ok(Math.abs(req.body.cost_usd - 0.07) < 1e-9);
    } finally {
      await server.close();
    }
  });

  test("requires --trace-file and --callback-url", async () => {
    const noTrace = await callback({ "callback-url": "http://example" });
    assert.strictEqual(noTrace.ok, false);
    assert.match(noTrace.error, /--trace-file is required/);
    const noUrl = await callback({ "trace-file": "/dev/null" });
    assert.strictEqual(noUrl.ok, false);
    assert.match(noUrl.error, /--callback-url is required/);
  });

  test("treats a missing verdict as 'failed'", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", summary: "session aborted" },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/nv`,
          "correlation-id": "nv",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "failed");
      assert.strictEqual(req.body.summary, "session aborted");
    } finally {
      await server.close();
    }
  });

  test("propagates discussion_id from meta header, replies, and trigger to the wire", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "orchestrator",
        seq: 0,
        event: { type: "meta", discussion_id: "GD_kw_test" },
      },
      { source: "agent", seq: 1, event: { type: "start" } },
      {
        source: "orchestrator",
        seq: 2,
        event: {
          type: "summary",
          verdict: "recessed",
          summary: "Awaiting human input",
          replies: [{ body: "Please weigh in", correlation_id: "rfc_1" }],
          trigger: { kind: "elapsed", elapsed: "P14D" },
        },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/recess`,
          "correlation-id": "r-1",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "recessed");
      assert.strictEqual(req.body.discussion_id, "GD_kw_test");
      assert.deepStrictEqual(req.body.replies, [
        { body: "Please weigh in", correlation_id: "rfc_1" },
      ]);
      assert.deepStrictEqual(req.body.trigger, {
        kind: "elapsed",
        elapsed: "P14D",
      });
    } finally {
      await server.close();
    }
  });

  test("uses the --discussion-id CLI override when the trace has no meta event", async () => {
    const server = await startServer(200);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: {
          type: "summary",
          verdict: "adjourned",
          summary: "done",
        },
      },
    ]);

    try {
      await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/api/callback/override`,
          "correlation-id": "o",
          "discussion-id": "GD_cli_override",
        },
        fsSync,
      );

      const req = server.getLastRequest();
      assert.strictEqual(req.body.discussion_id, "GD_cli_override");
      assert.strictEqual(req.body.verdict, "adjourned");
    } finally {
      await server.close();
    }
  });

  test("returns a failure envelope when the callback POST returns a non-2xx status", async () => {
    const server = await startServer(500);
    const { tracePath, fsSync } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", verdict: "success", summary: "ok" },
      },
    ]);

    try {
      const result = await callback(
        {
          "trace-file": tracePath,
          "callback-url": `${server.url}/x`,
          "correlation-id": "x",
        },
        fsSync,
      );
      assert.strictEqual(result.ok, false);
      assert.match(result.error, /Callback POST failed: 500/);
    } finally {
      await server.close();
    }
  });
});

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

import { runCallbackCommand } from "../src/commands/callback.js";

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
  const workdir = mkdtempSync(join(tmpdir(), "callback-test-"));
  const tracePath = join(workdir, "trace.ndjson");
  writeFileSync(
    tracePath,
    `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
  );
  return {
    tracePath,
    cleanup: () => rmSync(workdir, { recursive: true, force: true }),
  };
}

describe("fit-eval callback", () => {
  beforeEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  test("extracts the orchestrator summary and POSTs it to the callback URL", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
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
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": `${server.url}/api/callback/abc`,
        "correlation-id": "corr-123",
        "run-url": "https://github.com/foo/bar/actions/runs/42",
      });

      const req = server.getLastRequest();
      assert.strictEqual(req.method, "POST");
      assert.strictEqual(req.url, "/api/callback/abc");
      assert.deepStrictEqual(req.body, {
        correlation_id: "corr-123",
        kind: "terminal",
        verdict: "success",
        summary: "Routed to staff-engineer.",
        run_url: "https://github.com/foo/bar/actions/runs/42",
        replies: [],
        last_acted_seq: -1,
      });
    } finally {
      await server.close();
      cleanup();
    }
  });

  test("uses the most recent summary event when multiple appear", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
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
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": `${server.url}/api/callback/multi`,
        "correlation-id": "m",
      });

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "success");
      assert.strictEqual(req.body.summary, "final");
      assert.strictEqual(req.body.run_url, "");
    } finally {
      await server.close();
      cleanup();
    }
  });

  test("posts failure fallback when no orchestrator summary event is present", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
      { source: "agent", seq: 0, event: { type: "start" } },
    ]);

    try {
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": server.url,
        "correlation-id": "x",
      });

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "failed");
      assert.ok(req.body.summary.length > 0);
      assert.strictEqual(req.body.correlation_id, "x");
      assert.deepStrictEqual(req.body.replies, []);
    } finally {
      await server.close();
      cleanup();
    }
  });

  test("requires --trace-file and --callback-url", async () => {
    await assert.rejects(
      () => runCallbackCommand({ "callback-url": "http://example" }),
      /--trace-file is required/,
    );
    await assert.rejects(
      () => runCallbackCommand({ "trace-file": "/dev/null" }),
      /--callback-url is required/,
    );
  });

  test("treats a missing verdict as 'failed'", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", summary: "session aborted" },
      },
    ]);

    try {
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": `${server.url}/api/callback/nv`,
        "correlation-id": "nv",
      });

      const req = server.getLastRequest();
      assert.strictEqual(req.body.verdict, "failed");
      assert.strictEqual(req.body.summary, "session aborted");
    } finally {
      await server.close();
      cleanup();
    }
  });

  test("propagates discussion_id from meta header, replies, and trigger to the wire", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
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
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": `${server.url}/api/callback/recess`,
        "correlation-id": "r-1",
      });

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
      cleanup();
    }
  });

  test("uses the --discussion-id CLI override when the trace has no meta event", async () => {
    const server = await startServer(200);
    const { tracePath, cleanup } = writeTrace([
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
      await runCallbackCommand({
        "trace-file": tracePath,
        "callback-url": `${server.url}/api/callback/override`,
        "correlation-id": "o",
        "discussion-id": "GD_cli_override",
      });

      const req = server.getLastRequest();
      assert.strictEqual(req.body.discussion_id, "GD_cli_override");
      assert.strictEqual(req.body.verdict, "adjourned");
    } finally {
      await server.close();
      cleanup();
    }
  });

  test("throws when the callback POST returns a non-2xx status", async () => {
    const server = await startServer(500);
    const { tracePath, cleanup } = writeTrace([
      {
        source: "orchestrator",
        seq: 1,
        event: { type: "summary", verdict: "success", summary: "ok" },
      },
    ]);

    try {
      await assert.rejects(
        () =>
          runCallbackCommand({
            "trace-file": tracePath,
            "callback-url": `${server.url}/x`,
            "correlation-id": "x",
          }),
        /Callback POST failed: 500/,
      );
    } finally {
      await server.close();
      cleanup();
    }
  });
});

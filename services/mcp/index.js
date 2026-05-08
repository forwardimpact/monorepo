import crypto from "node:crypto";
import { createServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { registerToolsFromConfig } from "@forwardimpact/libmcp";

const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_SWEEP_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Builds the MCP prompt by appending one routing line per (tool, statement)
 * pair. Tools omitted from config — including those stripped post-init for a
 * particular environment — contribute no lines, keeping the prompt in sync
 * with actual tool wiring.
 *
 * @param {string} systemPrompt - Static prompt text from config
 * @param {Record<string, { routing?: string[] }>} [tools] - Tool definitions
 * @returns {string} Composed prompt text
 */
export function buildPromptText(systemPrompt, tools) {
  const lines = [];
  for (const [name, def] of Object.entries(tools || {})) {
    for (const stmt of def.routing || []) {
      lines.push(`${stmt} -> ${name}`);
    }
  }
  return lines.length ? `${systemPrompt}\n${lines.join("\n")}` : systemPrompt;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendInternalError(res, logger, err) {
  logger.error(`Request handling failed: ${err.message}`);
  if (res.headersSent) return;
  sendJson(res, 500, {
    jsonrpc: "2.0",
    error: { code: -32603, message: "Internal server error" },
    id: null,
  });
}

function tryServeHealth(req, res) {
  if (req.url !== "/health" || req.method !== "GET") return false;
  sendJson(res, 200, { status: "ok" });
  return true;
}

/**
 * Constant-time comparison of an HTTP `Authorization: Bearer …` header against
 * the configured token. Avoids leaking the token via per-byte timing of
 * `===` short-circuit. The length-mismatch fast path is safe because the
 * expected token's length is not itself a secret.
 *
 * @param {{ headers: { authorization?: unknown } }} req - Incoming HTTP request
 * @param {string} expectedToken - The configured bearer token
 * @returns {boolean} True if the request carries the expected token
 */
export function isAuthorized(req, expectedToken) {
  const auth = req.headers.authorization;
  if (typeof auth !== "string") return false;
  const expected = `Bearer ${expectedToken}`;
  if (auth.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

async function dispatchExistingSession(req, res, session, logger) {
  session.lastActivity = Date.now();
  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    sendInternalError(res, logger, err);
  }
}

async function dispatchNewSession(req, res, ctx) {
  const { sessions, makeServer, promptText, logger } = ctx;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const server = makeServer(promptText);
  transport.onclose = () => sessions.delete(transport.sessionId);
  await server.connect(transport);

  try {
    await transport.handleRequest(req, res);
  } catch (err) {
    sendInternalError(res, logger, err);
    return;
  }

  const sid = transport.sessionId;
  if (sid) {
    sessions.set(sid, { transport, server, lastActivity: Date.now() });
  }
}

/**
 * Creates a Guide MCP service instance.
 *
 * Each client session gets its own McpServer + transport pair, because the
 * MCP SDK's Protocol only supports one transport at a time. The system prompt
 * is read from config.systemPrompt and served via the guide-default MCP prompt.
 *
 * @param {{ config: object, logger: object, graphClient: object, vectorClient: object, pathwayClient: object, mapClient: object, resourceIndex: object }} deps
 * @returns {{ start: () => Promise<void> }}
 */
export function createMcpService({
  config,
  logger,
  graphClient,
  vectorClient,
  pathwayClient,
  mapClient,
  resourceIndex,
}) {
  function makeServer(promptText) {
    const server = new McpServer(
      { name: "guide", version: "0.1.0" },
      { instructions: promptText },
    );
    registerToolsFromConfig(
      server,
      config,
      {
        graph: graphClient,
        vector: vectorClient,
        pathway: pathwayClient,
        map: mapClient,
      },
      resourceIndex,
    );
    server.prompt(
      "guide-default",
      "Scope and tool routing for agents using the engineering standard knowledge graph.",
      () => ({
        messages: [
          { role: "user", content: { type: "text", text: promptText } },
        ],
      }),
    );
    return server;
  }

  async function start() {
    const promptText = buildPromptText(config.systemPrompt, config.tools);
    const host = config.host || "0.0.0.0";
    const port = config.port || 3005;
    const expectedToken = config.mcpToken();
    const sessions = new Map();
    const ctx = { sessions, makeServer, promptText, logger };

    const httpServer = createServer(async (req, res) => {
      if (tryServeHealth(req, res)) return;
      if (!isAuthorized(req, expectedToken)) {
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
      const sessionId = req.headers["mcp-session-id"];
      const existing = sessionId && sessions.get(sessionId);
      if (existing) {
        await dispatchExistingSession(req, res, existing, logger);
        return;
      }
      await dispatchNewSession(req, res, ctx);
    });

    httpServer.on("error", (err) => {
      logger.error(`HTTP server error: ${err.message}`);
      if (err.code === "EADDRINUSE") process.exit(1);
    });

    httpServer.listen(port, host, () => {
      logger.info(`MCP server listening on ${host}:${port}`);
    });

    const sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [sid, session] of sessions) {
        if (now - session.lastActivity > SESSION_IDLE_MS) {
          logger.info(`Reaping idle session ${sid}`);
          session.server.close();
        }
      }
    }, SESSION_SWEEP_MS);
    sweepTimer.unref();

    const shutdown = async () => {
      logger.info("Shutting down MCP server");
      clearInterval(sweepTimer);

      const forceExit = setTimeout(() => {
        logger.error("Shutdown timed out, forcing exit");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceExit.unref();

      await Promise.allSettled(
        [...sessions.values()].map((s) => s.server.close()),
      );
      sessions.clear();
      httpServer.close();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  return { start };
}

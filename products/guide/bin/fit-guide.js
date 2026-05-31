#!/usr/bin/env node
/**
 * fit-guide CLI — Claude Agent SDK harness running inside librepl
 *
 * Agent-aligned engineering standard knowledge agent reachable from three surfaces:
 * this CLI, Claude Code (MCP), and Claude Chat (Connector).
 */

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  createProductConfig,
  createServiceConfig,
} from "@forwardimpact/libconfig";
import { createAgentTraceFormatter } from "@forwardimpact/libformat";
import { Repl } from "@forwardimpact/librepl";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// Sole construction site for the injected collaborator bag threaded into the
// single-flow command handlers (init, login, status).
const runtime = createDefaultRuntime();

const __dirname = dirname(fileURLToPath(import.meta.url));
// `bun build --compile` injects FIT_GUIDE_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_GUIDE_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;

// ---------------------------------------------------------------------------
// MCP prompt fetch
// ---------------------------------------------------------------------------

function parseSseResult(text) {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      if (parsed?.result) return parsed;
    } catch {}
  }
  return undefined;
}

async function readMcpBody(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return parseSseResult(await res.text());
  }
  return res.json();
}

async function fetchMcpPrompt(url, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };

  const init = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "fit-guide-cli", version: VERSION },
      },
    }),
  });
  if (!init.ok) return null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Mcp-Session-Id": init.headers.get("mcp-session-id"),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: { name: "guide-default" },
    }),
  });
  if (!res.ok) return null;

  const body = await readMcpBody(res);
  return body?.result?.messages?.[0]?.content?.text || null;
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

let mcpUrl = null;
let mcpToken = null;
let systemPrompt = null;
let sessionId = null;

const repl = new Repl({
  prompt: "❯ ",
  indent: "  ",
  usage:
    "**fit-guide** — Agent-aligned engineering standard knowledge agent.\n\n" +
    "Type a question about your agent-aligned engineering standard.",
  storage: createStorage("guide"),
  state: {},
  documentation: [
    {
      title: "Guide Overview",
      url: "https://www.forwardimpact.team/guide/index.md",
      description: "Product overview, audience model, and key concepts.",
    },
    {
      title: "Getting Started: Guide for Engineers",
      url: "https://www.forwardimpact.team/docs/getting-started/engineers/guide/index.md",
      description:
        "Set up the AI agent that understands your engineering standard.",
    },
    {
      title: "See What's Expected at Your Level",
      url: "https://www.forwardimpact.team/docs/products/career-paths/index.md",
      description: "Stop guessing what your level requires.",
    },
    {
      title: "Understand Autonomy and Scope",
      url: "https://www.forwardimpact.team/docs/products/career-paths/autonomy-scope/index.md",
      description: "What each level implies for decision-making and ownership.",
    },
    {
      title: "Find Growth Areas and Build Evidence",
      url: "https://www.forwardimpact.team/docs/products/growth-areas/index.md",
      description: "Identify gaps and track progress toward the next level.",
    },
    {
      title: "Ask a Growth Question",
      url: "https://www.forwardimpact.team/docs/products/growth-areas/growth-question/index.md",
      description: "Get context-specific guidance grounded in your standard.",
    },
    {
      title: "Check Progress Toward Next Level",
      url: "https://www.forwardimpact.team/docs/products/growth-areas/check-progress/index.md",
      description: "See where you stand against level expectations.",
    },
    {
      title: "Verify Agent Work Against the Standard",
      url: "https://www.forwardimpact.team/docs/products/trust-output/index.md",
      description: "Know what to expect from agent output.",
    },
    {
      title: "Get a Second Opinion on a Deliverable",
      url: "https://www.forwardimpact.team/docs/products/trust-output/second-opinion/index.md",
      description: "Have the Guide review work against quality criteria.",
    },
  ],

  commands: {
    init: {
      usage: "Initialize Guide configuration",
      type: "boolean",
      handler: async () => {
        const { runInitCommand } = await import("../src/commands/init.js");
        const result = await runInitCommand(runtime);
        if (!result?.ok) runtime.proc.exit(result?.code ?? 1);
        return false;
      },
    },
    login: {
      usage: "Authenticate with Anthropic",
      type: "boolean",
      handler: async () => {
        const { login } = await import("../src/lib/login.js");
        const config = await createServiceConfig("mcp");
        await login(config, runtime);
        return false;
      },
    },
    logout: {
      usage: "Clear stored credentials",
      type: "boolean",
      handler: async () => {
        const config = await createServiceConfig("mcp");
        await config.clearOAuthCredential();
        process.stdout.write("Logged out. Stored credential removed.\n");
        return false;
      },
    },
    status: {
      usage: "Check system readiness",
      type: "boolean",
      handler: async () => {
        const { runStatusCommand } = await import("../src/commands/status.js");
        await runStatusCommand({ json: false }, runtime);
        return false;
      },
    },
    version: {
      usage: "Show version",
      type: "boolean",
      handler: async () => {
        process.stdout.write(`fit-guide v${VERSION}\n`);
        return false;
      },
    },
  },

  setup: async () => {
    const [guideConfig, mcpConfig] = await Promise.all([
      createProductConfig("guide"),
      createServiceConfig("mcp"),
    ]);
    process.env.ANTHROPIC_API_KEY = await mcpConfig.anthropicToken();
    mcpUrl = mcpConfig.url;
    mcpToken = mcpConfig.mcpToken();

    const mcpPrompt = await fetchMcpPrompt(mcpUrl, mcpToken);
    systemPrompt = mcpPrompt
      ? `${guideConfig.systemPrompt}\n\n${mcpPrompt}`
      : guideConfig.systemPrompt;
  },

  onLine: async (line, state, output) => {
    const options = {
      mcpServers: {
        guide: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${mcpToken}` },
        },
      },
      allowedTools: ["mcp__guide__*"],
    };

    if (sessionId) {
      options.resume = sessionId;
    } else {
      options.model = process.env.GUIDE_MODEL || "claude-sonnet-4-6";
      options.systemPrompt = systemPrompt;
    }

    const trace = createAgentTraceFormatter(process.stderr, {
      indent: "  ",
      marker: "⏺ ",
    });

    process.stderr.write("\n");

    const iterator = query({ prompt: line, options });
    for await (const message of iterator) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }

      if (message.type === "assistant") {
        trace.writeBlocks(message.message?.content);
      }

      if (message.type === "result" && message.result) {
        process.stdout.write(trace.marker);
        output.write(`${message.result}\n`);
      }
    }
  },
});

repl.start();

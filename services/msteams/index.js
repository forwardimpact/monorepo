import { randomUUID } from "node:crypto";

import botbuilder from "botbuilder";
import express from "express";

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } =
  botbuilder;

const HISTORY_MAX_EXCHANGES = 5;
const PROMPT_CHAR_CAP = 4000;
const GITHUB_WORKFLOW_FILE = "agent-react.yml";
const GITHUB_REF = "main";

/**
 * Build a facilitator prompt from the current message text and a rolling
 * conversation history. History is bounded to the last 5 exchanges (10
 * entries) and the total prompt size is capped at ~4000 characters by
 * dropping the oldest history entries until it fits.
 *
 * @param {string} text - The current user message
 * @param {Array<{role: "user"|"assistant", text: string}>} history - Prior
 *   exchanges in chronological order. Most recent last.
 * @returns {string}
 */
export function buildPrompt(text, history) {
  const trimmed = history.slice(-HISTORY_MAX_EXCHANGES * 2);
  while (trimmed.length > 0) {
    const block = trimmed
      .map((h) => `${h.role === "user" ? "User" : "Agent"}: ${h.text}`)
      .join("\n\n");
    const composed = `Prior conversation:\n${block}\n\nCurrent message: ${text}`;
    if (composed.length <= PROMPT_CHAR_CAP) return composed;
    trimmed.shift();
  }
  return text;
}

/**
 * Format the verdict and summary as a Teams reply.
 *
 * @param {{verdict: string, summary: string, run_url?: string}} payload
 * @returns {string}
 */
export function formatReply(payload) {
  const verdict = payload.verdict ?? "unknown";
  const summary = payload.summary ?? "";
  const runUrl = payload.run_url;
  const head = `**${verdict}** — ${summary}`;
  return runUrl ? `${head}\n\n[run log](${runUrl})` : head;
}

/**
 * Append a message to a bounded history, dropping the oldest entries when
 * the cap is exceeded. Exported for unit testing.
 *
 * @param {Array<{role: "user"|"assistant", text: string}>} history
 * @param {{role: "user"|"assistant", text: string}} entry
 */
export function appendHistory(history, entry) {
  history.push(entry);
  const max = HISTORY_MAX_EXCHANGES * 2;
  while (history.length > max) history.shift();
}

/**
 * Strip trailing slashes from a base URL so concatenation does not produce
 * double-slashes that fail route matching on the callback endpoint.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Dispatch a workflow_dispatch event on agent-react.yml with the supplied
 * prompt and callback information.
 *
 * @param {object} opts
 * @param {string} opts.githubToken
 * @param {string} opts.githubRepo - "owner/repo"
 * @param {string} opts.prompt
 * @param {string} opts.callbackUrl
 * @param {string} opts.correlationId
 */
async function dispatchWorkflow({
  githubToken,
  githubRepo,
  prompt,
  callbackUrl,
  correlationId,
}) {
  const url = `https://api.github.com/repos/${githubRepo}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: GITHUB_REF,
      inputs: {
        prompt,
        callback_url: callbackUrl,
        correlation_id: correlationId,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `workflow_dispatch failed: ${res.status} ${res.statusText} ${body}`,
    );
  }
}

/**
 * Construct the bridge service. The factory function is the composition
 * root — adapter, stores, and Express app are created inside and exposed
 * on the returned object for test access.
 *
 * @param {object} config
 * @param {string} config.microsoftAppId
 * @param {string} config.microsoftAppPassword
 * @param {string} config.microsoftAppTenantId
 * @param {string} config.githubToken
 * @param {string} config.githubRepo - "owner/repo"
 * @param {string} config.callbackBaseUrl - Public base URL (no trailing slash)
 * @param {number} [config.port=3978]
 * @returns {{ start: () => Promise<void>, conversations: Map<string, {ref: object, history: Array<{role: string, text: string}>}>, pendingCallbacks: Map<string, {correlationId: string, threadId: string}>, buildPrompt: typeof buildPrompt }}
 */
export function createBridge(config) {
  const port = config.port ?? 3978;
  const callbackBaseUrl = normalizeBaseUrl(config.callbackBaseUrl);
  const conversations = new Map();
  const pendingCallbacks = new Map();

  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.microsoftAppId,
    MicrosoftAppPassword: config.microsoftAppPassword,
    MicrosoftAppTenantId: config.microsoftAppTenantId,
    MicrosoftAppType: "SingleTenant",
  });
  const adapter = new CloudAdapter(auth);

  adapter.onTurnError = async (context, error) => {
    console.error("Bot Framework turn error:", error);
    try {
      await context.sendActivity("Sorry, something went wrong.");
    } catch (sendError) {
      console.error("Failed to send error notice:", sendError);
    }
  };

  async function handleMessageActivity(context) {
    const activity = context.activity;
    if (activity.type !== "message") return;

    const threadId = activity.conversation?.id;
    if (!threadId) return;

    const text = (activity.text ?? "").trim();
    if (!text) return;

    let state = conversations.get(threadId);
    if (!state) {
      state = { ref: null, history: [] };
      conversations.set(threadId, state);
    }
    state.ref = TurnContext.getConversationReference(activity);

    const prompt = buildPrompt(text, state.history);
    const correlationId = randomUUID();
    const callbackToken = randomUUID();
    const callbackUrl = `${callbackBaseUrl}/api/callback/${callbackToken}`;

    pendingCallbacks.set(callbackToken, { correlationId, threadId });

    await context.sendActivity("Working on it...");

    try {
      await dispatchWorkflow({
        githubToken: config.githubToken,
        githubRepo: config.githubRepo,
        prompt,
        callbackUrl,
        correlationId,
      });
      appendHistory(state.history, { role: "user", text });
    } catch (err) {
      pendingCallbacks.delete(callbackToken);
      console.error("workflow dispatch failed:", err);
      await context.sendActivity(
        `Failed to reach the agent team: ${err.message}`,
      );
    }
  }

  const app = express();
  app.use(express.json());

  app.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, (context) =>
      handleMessageActivity(context),
    );
  });

  app.post("/api/callback/:token", async (req, res) => {
    const { token } = req.params;
    const pending = pendingCallbacks.get(token);
    if (!pending) {
      res.status(404).json({ error: "Unknown callback token" });
      return;
    }

    const payload = req.body ?? {};
    // Defense in depth: the token already gates trust (capability URL),
    // but the workflow round-trips correlation_id specifically so the
    // bridge can detect a mis-routed callback. Reject mismatches before
    // emitting any Teams activity.
    if (payload.correlation_id !== pending.correlationId) {
      res.status(400).json({ error: "Correlation ID mismatch" });
      return;
    }
    pendingCallbacks.delete(token);

    const state = conversations.get(pending.threadId);
    if (!state || !state.ref) {
      res.status(410).json({ error: "Conversation reference missing" });
      return;
    }

    const replyText = formatReply(payload);
    try {
      await adapter.continueConversationAsync(
        config.microsoftAppId,
        state.ref,
        async (context) => {
          await context.sendActivity(replyText);
        },
      );
      appendHistory(state.history, {
        role: "assistant",
        text: payload.summary ?? "",
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Failed to deliver Teams reply:", err);
      res.status(500).json({ error: "Failed to deliver reply" });
    }
  });

  let server;

  async function start() {
    return new Promise((resolve) => {
      server = app.listen(port, () => {
        console.log(`Teams bridge listening on port ${port}`);
        resolve();
      });
    });
  }

  async function stop() {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
    server = null;
  }

  return {
    start,
    stop,
    conversations,
    pendingCallbacks,
    buildPrompt,
    formatReply,
    app,
  };
}

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
 * @param {import("@forwardimpact/libtelemetry").Logger} [config.logger]
 * @param {import("@forwardimpact/libtelemetry").Tracer} [config.tracer]
 */
export function createBridge(config) {
  const port = config.port ?? 3978;
  const callbackBaseUrl = normalizeBaseUrl(config.callbackBaseUrl);
  const logger = config.logger ?? null;
  const tracer = config.tracer ?? null;
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
    logger?.error("onTurnError", error);
    try {
      await context.sendActivity("Sorry, something went wrong.");
    } catch (sendError) {
      logger?.error("onTurnError", "failed to send error notice", {
        original: error?.message,
        send_error: sendError?.message,
      });
    }
  };

  async function handleMessageActivity(context) {
    const activity = context.activity;

    if (activity.type !== "message") {
      logger?.debug("handleActivity", "ignoring non-message activity", {
        type: activity.type,
      });
      return;
    }

    const threadId = activity.conversation?.id;
    if (!threadId) {
      logger?.debug("handleMessage", "ignoring activity without thread ID");
      return;
    }

    const text = (activity.text ?? "").trim();
    if (!text) {
      logger?.debug("handleMessage", "ignoring empty message", {
        thread_id: threadId,
      });
      return;
    }

    const from = activity.from?.name ?? activity.from?.id ?? "unknown";
    logger?.debug("handleMessage", "received", {
      thread_id: threadId,
      from,
      text_length: text.length,
    });

    const span = tracer
      ? tracer.startSpan("MsTeams.HandleMessage", {
          kind: "SERVER",
          attributes: { thread_id: threadId },
        })
      : null;

    const isNew = !conversations.has(threadId);
    let state = conversations.get(threadId);
    if (!state) {
      state = { ref: null, history: [] };
      conversations.set(threadId, state);
    }
    state.ref = TurnContext.getConversationReference(activity);

    if (isNew) {
      logger?.info("handleMessage", "new conversation", {
        thread_id: threadId,
        from,
        conversations_total: conversations.size,
      });
    } else {
      logger?.debug("handleMessage", "continuing conversation", {
        thread_id: threadId,
        history_size: state.history.length,
      });
    }

    const historyBefore = state.history.length;
    const prompt = buildPrompt(text, state.history);
    logger?.debug("handleMessage", "prompt built", {
      thread_id: threadId,
      history_entries_used: Math.min(historyBefore, HISTORY_MAX_EXCHANGES * 2),
      prompt_length: prompt.length,
      prompt_capped: prompt.length >= PROMPT_CHAR_CAP,
      history_included: prompt !== text,
    });

    const correlationId = randomUUID();
    const callbackToken = randomUUID();
    const callbackUrl = `${callbackBaseUrl}/api/callback/${callbackToken}`;

    pendingCallbacks.set(callbackToken, { correlationId, threadId });
    logger?.debug("handleMessage", "callback registered", {
      correlation_id: correlationId,
      pending_total: pendingCallbacks.size,
    });

    await context.sendActivity("Working on it...");
    logger?.debug("handleMessage", "acknowledgement sent", {
      thread_id: threadId,
    });

    logger?.info("handleMessage", "dispatching workflow", {
      thread_id: threadId,
      correlation_id: correlationId,
      repo: config.githubRepo,
      prompt_length: prompt.length,
      history_size: historyBefore,
    });

    try {
      await dispatchWorkflow({
        githubToken: config.githubToken,
        githubRepo: config.githubRepo,
        prompt,
        callbackUrl,
        correlationId,
      });
      logger?.info("handleMessage", "workflow dispatched", {
        thread_id: threadId,
        correlation_id: correlationId,
      });
      appendHistory(state.history, { role: "user", text });
      logger?.debug("handleMessage", "history updated", {
        thread_id: threadId,
        history_size: state.history.length,
      });
      if (span) {
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
      }
    } catch (err) {
      pendingCallbacks.delete(callbackToken);
      logger?.error("handleMessage", err, {
        thread_id: threadId,
        correlation_id: correlationId,
        pending_total: pendingCallbacks.size,
      });
      if (span) span.setError(err);
      await context.sendActivity(
        `Failed to reach the agent team: ${err.message}`,
      );
    } finally {
      if (span) await span.end();
    }
  }

  const app = express();
  app.use(express.json());

  app.post("/api/messages", async (req, res) => {
    logger?.debug("messages", "activity received");
    try {
      await adapter.process(req, res, (context) =>
        handleMessageActivity(context),
      );
    } catch (err) {
      logger?.error("messages", err);
      if (!res.headersSent) res.status(400).json({ error: "Invalid activity" });
    }
  });

  app.post("/api/callback/:token", async (req, res) => {
    const { token } = req.params;
    const pending = pendingCallbacks.get(token);
    if (!pending) {
      logger?.debug("callback", "unknown token");
      res.status(404).json({ error: "Unknown callback token" });
      return;
    }

    logger?.info("callback", "received", {
      correlation_id: pending.correlationId,
      thread_id: pending.threadId,
      verdict: req.body?.verdict,
    });

    const span = tracer
      ? tracer.startSpan("MsTeams.HandleCallback", {
          kind: "SERVER",
          attributes: { correlation_id: pending.correlationId },
        })
      : null;

    const payload = req.body ?? {};
    if (payload.correlation_id !== pending.correlationId) {
      logger?.error("callback", "correlation ID mismatch", {
        expected: pending.correlationId,
        received: payload.correlation_id,
      });
      if (span) {
        span.setError(new Error("Correlation ID mismatch"));
        await span.end();
      }
      res.status(400).json({ error: "Correlation ID mismatch" });
      return;
    }
    pendingCallbacks.delete(token);
    logger?.debug("callback", "token consumed", {
      correlation_id: pending.correlationId,
      pending_total: pendingCallbacks.size,
    });

    const state = conversations.get(pending.threadId);
    if (!state || !state.ref) {
      logger?.error("callback", "conversation reference missing", {
        thread_id: pending.threadId,
        conversation_exists: conversations.has(pending.threadId),
        ref_exists: !!state?.ref,
      });
      if (span) {
        span.setError(new Error("Conversation reference missing"));
        await span.end();
      }
      res.status(410).json({ error: "Conversation reference missing" });
      return;
    }

    const replyText = formatReply(payload);

    logger?.info("callback", "delivering reply", {
      thread_id: pending.threadId,
      correlation_id: pending.correlationId,
      verdict: payload.verdict,
      summary_length: (payload.summary ?? "").length,
      has_run_url: !!payload.run_url,
    });

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
      logger?.info("callback", "reply delivered", {
        thread_id: pending.threadId,
        correlation_id: pending.correlationId,
        verdict: payload.verdict,
        history_size: state.history.length,
      });
      if (span) {
        span.addEvent("reply_delivered", { verdict: payload.verdict });
        span.setOk();
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      logger?.error("callback", err, {
        thread_id: pending.threadId,
        correlation_id: pending.correlationId,
      });
      if (span) span.setError(err);
      res.status(500).json({ error: "Failed to deliver reply" });
    } finally {
      if (span) await span.end();
    }
  });

  let server;

  async function start() {
    return new Promise((resolve) => {
      server = app.listen(port, () => {
        logger?.info("server", "listening", {
          port,
          callback_base_url: callbackBaseUrl,
          repo: config.githubRepo,
          tracing: !!tracer,
        });
        resolve();
      });
    });
  }

  async function stop() {
    if (!server) return;
    logger?.info("server", "shutting down", {
      conversations: conversations.size,
      pending_callbacks: pendingCallbacks.size,
    });
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

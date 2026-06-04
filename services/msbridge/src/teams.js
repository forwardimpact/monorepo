import botbuilder from "botbuilder";

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } =
  botbuilder;

export { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext };

/**
 * No-op reaction adapter for the Bot Framework. Teams bots cannot
 * programmatically add reactions — the `messageReaction` activity type
 * is receive-only (fired when a *user* reacts). The typing adapter
 * provides user-visible progress instead.
 *
 * @returns {{add: Function, remove: Function}}
 */
export function buildReactionAdapter() {
  return {
    add: async () => null,
    remove: async () => {},
  };
}

/**
 * Typing adapter for the Bot Framework. Single responsibility: deliver
 * `text` to the conversation identified by `target.ref`. Acknowledgement
 * owns the verb pool and cadence.
 *
 * @param {object} adapter
 * @param {() => string} msAppIdFn
 * @returns {{send: Function}}
 */
export function buildTypingAdapter(adapter, msAppIdFn) {
  return {
    send: async (target, text) => {
      if (!target?.ref) return;
      await adapter.continueConversationAsync(
        msAppIdFn(),
        target.ref,
        async (turnContext) => {
          await turnContext.sendActivity(text);
        },
      );
    },
  };
}

/**
 * Post `text` as a Teams message in the conversation identified by `ref`.
 * @param {object} adapter
 * @param {() => string} msAppIdFn
 * @param {object} ref
 * @param {string} text
 */
export async function sendReply(adapter, msAppIdFn, ref, text) {
  await adapter.continueConversationAsync(
    msAppIdFn(),
    ref,
    async (turnContext) => {
      await turnContext.sendActivity(text);
    },
  );
}

/**
 * Build the default Bot Framework CloudAdapter wired to the service config.
 * @param {object} config
 * @returns {object}
 */
export function createDefaultAdapter(config) {
  // Multi-tenant (hosted) uses Microsoft's documented MultiTenant mode: the
  // app type is "MultiTenant" and the tenant id is omitted, so the Bot
  // Framework SDK accepts JWTs issued by any consenting Entra tenant.
  // Single-tenant (self-hosted) keeps the static tenant id binding.
  if (config.tenancy_mode === "multi") {
    const auth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: config.msAppId(),
      MicrosoftAppPassword: config.msAppPassword(),
      MicrosoftAppType: "MultiTenant",
    });
    return new CloudAdapter(auth);
  }
  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.msAppId(),
    MicrosoftAppPassword: config.msAppPassword(),
    MicrosoftAppTenantId: config.msAppTenantId(),
    MicrosoftAppType: "SingleTenant",
  });
  return new CloudAdapter(auth);
}

/**
 * Adapt the Bot Framework's express-style `adapter.process(req, res, cb)`
 * to a Hono request handler. The bridge service hands off the inbound
 * activity stream to this helper and gets a normal `(c) => Response`
 * back — `index.js` never sees the express shim.
 *
 * @param {object} adapter - Bot Framework CloudAdapter
 * @param {(turnContext: object) => Promise<void>} onContext
 * @param {{error?: Function}} [logger]
 * @returns {(c: object) => Promise<Response>}
 */
export function botFrameworkIntake(adapter, onContext, logger) {
  return async (c) => {
    const req = c.req.raw;
    const rawBody = c.get("rawBody");
    const expressLikeReq = {
      headers: Object.fromEntries(req.headers.entries()),
      body: rawBody ? JSON.parse(rawBody.toString("utf8")) : {},
      method: req.method,
    };
    const resLike = makeResLike();
    try {
      await adapter.process(expressLikeReq, resLike, onContext);
      return new Response(resLike._body ?? null, {
        status: resLike._status,
        headers: resLike._headers,
      });
    } catch (err) {
      logger?.error?.("messages", err);
      return c.json({ error: "Invalid activity" }, 400);
    }
  };
}

function makeResLike() {
  return {
    headersSent: false,
    _status: 200,
    _body: undefined,
    _headers: {},
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = JSON.stringify(body);
      this._headers["content-type"] = "application/json";
      this.headersSent = true;
      return this;
    },
    send(body) {
      this._body = body;
      this.headersSent = true;
      return this;
    },
    end(body) {
      if (body !== undefined) this._body = body;
      this.headersSent = true;
      return this;
    },
    header(k, v) {
      this._headers[k.toLowerCase()] = v;
    },
  };
}

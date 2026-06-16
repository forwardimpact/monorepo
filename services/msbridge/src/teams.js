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
 * Build the Bot Framework authenticator for the configured app type. The app
 * type follows whether `MICROSOFT_APP_TENANT_ID` is set, independent of
 * `tenancy_mode`: when present the authenticator runs SingleTenant bound to
 * that tenant (the supported shape — Microsoft deprecated multi-tenant Azure
 * Bot resources, so a hosted bot is a single-tenant resource in the operator's
 * home tenant); when absent it runs MultiTenant for a grandfathered
 * multi-tenant resource. The same authenticator validates both the
 * `/api/messages` activity stream and the `/onboard` JWT, so there is one SDK
 * validation path to maintain.
 *
 * @param {object} config
 * @returns {object} ConfigurationBotFrameworkAuthentication
 */
export function createBotFrameworkAuthentication(config) {
  const tenantId = config.msAppTenantId();
  if (tenantId) {
    return new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: config.msAppId(),
      MicrosoftAppPassword: config.msAppPassword(),
      MicrosoftAppTenantId: tenantId,
      MicrosoftAppType: "SingleTenant",
    });
  }
  return new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.msAppId(),
    MicrosoftAppPassword: config.msAppPassword(),
    MicrosoftAppType: "MultiTenant",
  });
}

/**
 * Build the default Bot Framework CloudAdapter wired to the service config.
 * @param {object} config
 * @returns {object}
 */
export function createDefaultAdapter(config) {
  return new CloudAdapter(createBotFrameworkAuthentication(config));
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

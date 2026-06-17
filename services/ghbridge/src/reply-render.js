import { bridge } from "@forwardimpact/libtype";
import { prepareLinkResume } from "@forwardimpact/libbridge";

import { postSingleDiscussionReply } from "./graphql.js";

const CHANNEL = "github-discussions";

/**
 * Reply-path helpers for `services/ghbridge`, extracted from the service class
 * to keep `index.js` within its line budget. Each helper closes over the
 * collaborators the service injects; behaviour is identical to the prior
 * in-class methods.
 *
 * @param {object} deps
 * @param {(q: string, v: object) => Promise<unknown>} deps.graphqlClient
 *   Static single-tenant GraphQL client.
 * @param {((repo: {owner: string, name: string}) => Function) | undefined} deps.makeGraphqlClient
 *   Per-repo GraphQL client factory (multi-tenant).
 * @param {boolean} deps.multiTenant
 * @param {import("@forwardimpact/libbridge").TenantResolver} deps.tenantResolver
 * @param {object} deps.client - BridgeClient (RecordOrigin)
 * @param {import("./discussion-adapter.js").DiscussionAdapter} deps.store
 * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock
 * @param {object} deps.config
 * @param {Set<string>} deps.trustedOrigins
 * @param {object} deps.logger
 */
export function createReplyRender({
  graphqlClient,
  makeGraphqlClient,
  multiTenant,
  tenantResolver,
  client,
  store,
  clock,
  config,
  trustedOrigins,
  logger,
}) {
  /**
   * Resolve the GraphQL client for a context's reply path. Multi-tenant mints
   * an installation token for the resolved tenant repo; single-tenant returns
   * the static client. Guards the `resolveByTenantId` privilege-escalation
   * hazard (rows return regardless of state) by refusing non-active tenants.
   */
  async function graphqlFor(ctx) {
    if (!multiTenant || !makeGraphqlClient) return graphqlClient;
    const tenant = await tenantResolver.resolveByTenantId({
      tenant_id: ctx.tenant_id,
    });
    if (!tenant || tenant.state !== "active" || !tenant.repo) {
      throw new Error("tenant_unresolved");
    }
    return makeGraphqlClient(tenant.repo);
  }

  /** Record an origin for a comment the bridge itself posted, tenant-scoped. */
  function recordOrigin(ctx) {
    return async (comment) => {
      const tenant_id =
        ctx.tenant_id ?? (await store.tenantForChannel(ctx.channel));
      await client.RecordOrigin(
        bridge.Origin.fromObject({
          id: comment.id,
          discussion_id: ctx.discussion_id,
          posted_at: clock.now(),
          tenant_id,
        }),
      );
    };
  }

  async function stashAndPostLink(ctx, result, requester) {
    const prepared = prepareLinkResume({
      authorizeUrl: result.authorizeUrl,
      callbackBaseUrl: config.callback_base_url,
      trustedOrigins,
      tenantId: result.tenant_id,
    });
    if (prepared.skipped) {
      logger.info("link-resume", "skipped", {
        reason: prepared.reason,
        discussion_id: ctx.discussion_id,
      });
      return;
    }
    await store.putPendingDispatch({
      link_token: prepared.linkToken,
      surface: CHANNEL,
      surface_user_id: requester,
      discussion_id: ctx.discussion_id,
      created_at: clock.now(),
      tenant_id: result.tenant_id,
    });
    await postSingleDiscussionReply(
      await graphqlFor(ctx),
      ctx,
      `To dispatch, link your GitHub account: ${prepared.augmentedUrl}`,
      recordOrigin(ctx),
    );
  }

  async function renderDeclined(ctx, outcome) {
    let body;
    switch (outcome.kind) {
      case "link_required":
        body = `To dispatch, link your GitHub account: ${outcome.authorizeUrl}`;
        break;
      case "reauth_required":
        body =
          "Your GitHub link has expired. Please re-link your account to dispatch.";
        break;
      case "transient":
        body =
          "Unable to verify your GitHub identity right now. Please try again later.";
        break;
      default:
        return;
    }
    await postSingleDiscussionReply(
      await graphqlFor(ctx),
      ctx,
      body,
      recordOrigin(ctx),
    );
  }

  async function handleDispatchResult(ctx, result, requester) {
    if (result.kind === "link_required") {
      await stashAndPostLink(ctx, result, requester);
    } else {
      await renderDeclined(ctx, result);
    }
  }

  return {
    graphqlFor,
    recordOrigin,
    stashAndPostLink,
    renderDeclined,
    handleDispatchResult,
  };
}

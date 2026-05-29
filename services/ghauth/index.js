import crypto from "node:crypto";
import { services } from "@forwardimpact/librpc";
import { RevokedError } from "./src/github-oauth.js";

const { GhauthBase } = services;

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const GITHUB_ID_SURFACES = new Set(["github-discussions"]);

/**
 * GitHub user authentication service — Kata Agent User App token lifecycle.
 * @augments GhauthBase
 */
export class GhauthService extends GhauthBase {
  #bindings;
  #flows;
  #grants;
  #github;
  #linkBaseUrl;

  /**
   * @param {object} config
   * @param {object} deps
   * @param {import("./src/stores.js").BindingStore} deps.bindings
   * @param {import("./src/stores.js").FlowStore} deps.flows
   * @param {import("./src/stores.js").GrantStore} deps.grants
   * @param {ReturnType<import("./src/github-oauth.js").createGithubOAuth>} deps.github
   */
  constructor(config, { bindings, flows, grants, github }) {
    super(config);
    this.#bindings = bindings;
    this.#flows = flows;
    this.#grants = grants;
    this.#github = github;
    this.#linkBaseUrl = config.link_base_url;
  }

  /**
   * @param {object} req
   * @returns {Promise<object>}
   */
  async Begin(req) {
    const state = crypto.randomUUID();
    const redirectUri = `${this.#linkBaseUrl}/callback`;

    await this.#flows.add({
      id: state,
      surface: req.surface,
      surface_user_id: req.surface_user_id,
      code_challenge: req.code_challenge ?? null,
      redirect_uri: req.redirect_uri ?? null,
      client_state: req.client_state ?? null,
      created_at: Date.now(),
    });

    const upstreamUrl = this.#github.authorizeUrl({
      state,
      redirectUri,
      scopes: req.scopes ?? [],
    });

    return { upstream_authorize_url: upstreamUrl, state };
  }

  /**
   * @param {object} req
   * @returns {Promise<object>}
   */
  async Complete(req) {
    const flow = await this.#flows.consume(req.state);
    if (!flow) throw new Error("Unknown or expired flow state");

    const redirectUri = `${this.#linkBaseUrl}/callback`;
    const tokens = await this.#github.exchangeCode(req.code, redirectUri);

    const authorizedGithubId = String(
      await this.#github.getUser(tokens.access_token),
    );

    if (
      GITHUB_ID_SURFACES.has(flow.surface) &&
      authorizedGithubId !== flow.surface_user_id
    ) {
      return { outcome: "identity_mismatch" };
    }

    const bindingId = this.#bindings.constructor.keyOf(
      flow.surface,
      flow.surface_user_id,
    );
    await this.#bindings.upsert({
      id: bindingId,
      github_user_id: authorizedGithubId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
      scopes: flow.scopes ?? [],
    });

    if (flow.redirect_uri) {
      const downstreamCode = crypto.randomUUID();
      await this.#grants.add({
        id: downstreamCode,
        surface: flow.surface,
        surface_user_id: flow.surface_user_id,
        code_challenge: flow.code_challenge,
        redirect_uri: flow.redirect_uri,
        client_state: flow.client_state,
        created_at: Date.now(),
      });
      return {
        downstream_code: downstreamCode,
        redirect_uri: flow.redirect_uri,
        client_state: flow.client_state,
      };
    }

    return {};
  }

  /**
   * @param {object} req
   * @returns {Promise<object>}
   */
  async Redeem(req) {
    const grant = await this.#grants.consume(req.code);
    if (!grant) throw new Error("Unknown or expired grant code");

    if (grant.code_challenge) {
      const expected = crypto
        .createHash("sha256")
        .update(req.code_verifier)
        .digest("base64url");
      if (expected !== grant.code_challenge) {
        throw new Error("PKCE code_verifier mismatch");
      }
    }

    const binding = await this.#bindings.loadBinding(
      grant.surface,
      grant.surface_user_id,
    );
    if (!binding) throw new Error("Binding not found for grant");

    return {
      access_token: binding.access_token,
      token_type: "bearer",
      expires_in: binding.expires_at
        ? Math.max(0, Math.floor((binding.expires_at - Date.now()) / 1000))
        : 0,
    };
  }

  /**
   * @param {object} req
   * @returns {Promise<object>}
   */
  async GetToken(req) {
    const binding = await this.#bindings.loadBinding(
      req.surface,
      req.surface_user_id,
    );

    if (!binding) {
      const authorizeUrl = `${this.#linkBaseUrl}/authorize?surface=${encodeURIComponent(req.surface)}&surface_user_id=${encodeURIComponent(req.surface_user_id)}`;
      return {
        result: "link_required",
        link_required: { authorize_url: authorizeUrl },
      };
    }

    if (
      binding.expires_at &&
      Date.now() > binding.expires_at - EXPIRY_BUFFER_MS
    ) {
      if (!binding.refresh_token) {
        return { result: "re_auth_required", re_auth_required: {} };
      }
      try {
        const refreshed = await this.#github.refresh(binding.refresh_token);
        binding.access_token = refreshed.access_token;
        binding.refresh_token =
          refreshed.refresh_token ?? binding.refresh_token;
        binding.expires_at = refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : null;
        await this.#bindings.upsert(binding);
      } catch (err) {
        if (err instanceof RevokedError) {
          return { result: "re_auth_required", re_auth_required: {} };
        }
        throw err;
      }
    }

    return { result: "token", token: binding.access_token };
  }

  /**
   * @param {object} req
   * @returns {Promise<object>}
   */
  async Revoke(req) {
    const binding = await this.#bindings.loadBinding(
      req.surface,
      req.surface_user_id,
    );
    if (binding) {
      await this.#github.revoke(binding.access_token);
      await this.#bindings.delete(binding.id);
    }
    return {};
  }

  /**
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.#bindings.shutdown();
    await this.#flows.shutdown();
    await this.#grants.shutdown();
  }
}

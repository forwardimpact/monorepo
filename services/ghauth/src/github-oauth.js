/**
 * Thrown when GitHub reports a token grant as revoked.
 */
export class RevokedError extends Error {
  /** @param {string} [message] */
  constructor(message = "Token revoked") {
    super(message);
    this.name = "RevokedError";
  }
}

/**
 * Create a GitHub OAuth client for the Kata Agent User App.
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {object}
 */
export function createGithubOAuth({
  clientId,
  clientSecret,
  fetchImpl = fetch,
}) {
  const tokenUrl = "https://github.com/login/oauth/access_token";

  return {
    authorizeUrl({ state, redirectUri, scopes = [] }) {
      const params = new URLSearchParams({
        client_id: clientId,
        state,
        redirect_uri: redirectUri,
      });
      if (scopes.length) params.set("scope", scopes.join(" "));
      return `https://github.com/login/oauth/authorize?${params}`;
    },

    async exchangeCode(code, redirectUri) {
      const res = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const body = await res.json();
      if (body.error) throw new Error(`GitHub OAuth error: ${body.error}`);
      return {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
      };
    },

    async refresh(refreshToken) {
      const res = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const body = await res.json();
      if (body.error === "bad_refresh_token" || body.error === "unauthorized") {
        throw new RevokedError(`GitHub refresh failed: ${body.error}`);
      }
      if (body.error) throw new Error(`GitHub refresh error: ${body.error}`);
      return {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
      };
    },

    async getUser(accessToken) {
      const res = await fetchImpl("https://api.github.com/user", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`);
      const body = await res.json();
      return body.id;
    },

    async revoke(accessToken) {
      const res = await fetchImpl(
        `https://api.github.com/applications/${clientId}/token`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
          body: JSON.stringify({ access_token: accessToken }),
        },
      );
      if (!res.ok && res.status !== 422) {
        throw new Error(`GitHub revoke failed: ${res.status}`);
      }
    },
  };
}

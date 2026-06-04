import { createAppAuth } from "@octokit/auth-app";

/**
 * In-process GitHub App key custody.
 *
 * Wraps `@octokit/auth-app` so the rest of the service mints
 * installation tokens through a single `mintInstallationToken` call
 * without touching the App private key directly. `@octokit/auth-app`
 * memoizes installation tokens by `installation_id` for the duration
 * of their validity; threading the resolved `installation_id` on every
 * call keeps the memoization key per-installation, so a token minted
 * for one installation is never reused for another.
 *
 * @param {object} options
 * @param {string} options.app_id - GitHub App id.
 * @param {string} options.private_key - GitHub App private key (PEM).
 * @returns {{ mintInstallationToken: (req: {owner: string, name: string, installation_id: string}) => Promise<{token: string, expires_at: number}> }}
 */
export function createAppAuthCustody({ app_id, private_key }) {
  const appAuth = createAppAuth({ appId: app_id, privateKey: private_key });

  return {
    /**
     * @param {{name: string, installation_id: string}} req
     * @returns {Promise<{token: string, expires_at: number}>}
     */
    async mintInstallationToken({ name, installation_id }) {
      const result = await appAuth({
        type: "installation",
        installationId: installation_id,
        repositoryNames: [name],
      });
      return {
        token: result.token,
        expires_at: Date.parse(result.expiresAt),
      };
    },
  };
}

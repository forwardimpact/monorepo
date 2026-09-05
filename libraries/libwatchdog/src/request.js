// One GitHub REST transport for the probes and the latch. It shells out to no
// `gh` binary and it reads no ambient clock: the caller injects both the
// fetch implementation and the clock the backoff sleeps on.

import { createRetry } from "@forwardimpact/libutil";

/** The GitHub REST base. The latch strips it back off a `Link` header. */
export const API = "https://api.github.com";

/**
 * Decide whether a 403 response is a rate limit rather than a permission
 * refusal. A primary limit sets `x-ratelimit-remaining: 0`. A secondary limit
 * keeps a non-zero remaining and names the reason in the body.
 * @param {Response} res - The 403 response.
 * @returns {Promise<boolean>} `true` when the refusal is a rate limit.
 */
async function isRateLimited(res) {
  if (res.headers.get("x-ratelimit-remaining") === "0") return true;
  try {
    const text = await res.clone().text();
    return /rate limit|secondary rate/i.test(text);
  } catch {
    return false;
  }
}

/**
 * Build a retrying GitHub REST request function.
 * @param {object} options
 * @param {string} options.token - The credential sent as a bearer token.
 * @param {{sleep: (ms: number) => Promise<void>}} options.clock - The clock the
 *   backoff sleeps on.
 * @param {Function} [options.fetchImpl] - The fetch implementation to call.
 * @param {number} [options.retries] - Retry attempts after the first call.
 * @returns {(path: string, init?: object) => Promise<{body: *, headers: *}>}
 *   The request function.
 */
export function createRequest({
  token,
  clock,
  fetchImpl = fetch,
  retries = 4,
}) {
  const retry = createRetry({ retries, sleep: (ms) => clock.sleep(ms) });

  return async function request(path, init = {}) {
    const res = await retry.execute(async () => {
      const response = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.headers ?? {}),
        },
      });
      // Raise a rate-limited 403 as a retryable error. `Retry` matches
      // `/http (\d{3})/` on the message, so the status has to sit in the text.
      if (response.status === 403 && (await isRateLimited(response))) {
        throw new Error("HTTP 429: rate limited");
      }
      return response;
    });

    // Raise the failure here, never inside the retried function. Raised
    // inside, a 404 would read as a retryable error and burn all five
    // attempts before it reached the latch.
    if (!res.ok) {
      const error = new Error(`GitHub ${res.status} on ${path}`);
      error.status = res.status;
      throw error;
    }

    const text = await res.text();
    return { body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

# Part 1 — libconfig credential extensions

## Scope

Add Anthropic and MCP credential support to the existing `Config` class in
`libraries/libconfig/`. No new library — two new public methods, one OAuth token
store, and the private plumbing to make them work.

## Prerequisites

None. This is the foundation part.

## Steps

### 1. Add credential keys

**File:** `libraries/libconfig/src/config.js`

Add `ANTHROPIC_API_KEY` and `MCP_TOKEN` to the credential-key set (the list that
routes `.env` values into the private `#envOverrides` map instead of
`process.env`). They join the existing `GITHUB_TOKEN`, `LLM_TOKEN`,
`JWT_SECRET`, etc.

The credential-key set is `static #CREDENTIAL_KEYS` on the `Config` class. Add
`'ANTHROPIC_API_KEY'` and `'MCP_TOKEN'` to it.

### 2. Add `mcpToken()` method

**File:** `libraries/libconfig/src/config.js`

Synchronous getter, same pattern as `jwtSecret()`. Use the existing `#env(key)`
private helper (`this.#process.env[key] ?? this.#envOverrides[key]`) — do not
access `#envOverrides` directly.

```javascript
mcpToken() {
  const token = this.#env('MCP_TOKEN');
  if (!token) {
    throw new Error('MCP_TOKEN not configured. Run `fit-guide init` or add MCP_TOKEN to .env');
  }
  return token;
}
```

### 3. Add OAuth token persistence

**File:** `libraries/libconfig/src/config.js`

Four private methods manage a JSON file at `{storage}/anthropic-oauth.json`:

- `#oauthStoragePath()` — returns the absolute path via the existing storage
  abstraction (`this.#storage.path('anthropic-oauth.json')`).
- `async #readOAuthToken()` — reads and JSON-parses the file. Returns
  `{ access_token, refresh_token, expires_at }` or `null` if the file is
  missing, empty, or corrupt (swallow parse errors, treat as "not logged in").
- `async #writeOAuthToken(data)` — writes
  `{ access_token, refresh_token, expires_at }` as JSON. Creates parent
  directories if needed.
- `async #clearOAuthToken()` — deletes the file. No-op if already absent.

Two public methods exposed for the CLI login/logout flow (Part 3):

- `async writeOAuthCredential(tokenData)` — delegates to `#writeOAuthToken`.
- `async clearOAuthCredential()` — delegates to `#clearOAuthToken`.

### 4. Add `#refreshOAuthToken()` private method

**File:** `libraries/libconfig/src/config.js`

Calls Anthropic's token endpoint with the refresh token. Constants at module
scope:

```javascript
const ANTHROPIC_TOKEN_URL =
  process.env.ANTHROPIC_OAUTH_TOKEN_URL || 'https://auth.anthropic.com/oauth/token';
```

Implementation:

```javascript
async #refreshOAuthToken(refreshToken) {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const body = await res.json();
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? refreshToken,
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}
```

The env-var override on the URL allows tests and staging environments to point
at a mock endpoint without touching production constants.

### 5. Add `anthropicToken()` method

**File:** `libraries/libconfig/src/config.js`

Async getter. Resolution order: env-var → OAuth store (refresh if expired) →
typed error.

```javascript
async anthropicToken() {
  // 1. Env var wins (via #env which checks process.env then #envOverrides)
  const envKey = this.#env('ANTHROPIC_API_KEY');
  if (envKey) return envKey;

  // 2. OAuth store
  const oauth = await this.#readOAuthToken();
  if (!oauth) {
    throw new Error(
      'Not authenticated. Run `fit-guide login` or set ANTHROPIC_API_KEY.'
    );
  }

  // 3. Refresh if expired (5-minute buffer)
  if (Date.now() >= oauth.expires_at - 5 * 60 * 1000) {
    try {
      const refreshed = await this.#refreshOAuthToken(oauth.refresh_token);
      await this.#writeOAuthToken(refreshed);
      return refreshed.access_token;
    } catch {
      await this.#clearOAuthToken();
      throw new Error(
        'Session expired. Run `fit-guide login` to re-authenticate.'
      );
    }
  }

  return oauth.access_token;
}
```

### 6. Tests

**File:** `libraries/libconfig/test/libconfig-credentials.test.js` (new)

Test cases using `node:test` with mock storage and mock fetch:

| Test                                                 | Setup                               | Assertion                                                  |
| ---------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `mcpToken()` returns value from .env                 | `.env` has `MCP_TOKEN=secret`       | Returns `"secret"`                                         |
| `mcpToken()` throws when absent                      | No MCP_TOKEN anywhere               | Throws with "not configured"                               |
| `anthropicToken()` prefers env var                   | Both env var and OAuth file present | Returns env var value                                      |
| `anthropicToken()` falls back to OAuth               | No env var, valid OAuth file        | Returns `access_token` from file                           |
| `anthropicToken()` refreshes expired token           | OAuth file with past `expires_at`   | Calls refresh endpoint, writes new file, returns new token |
| `anthropicToken()` clears on failed refresh          | OAuth file expired, refresh 401s    | Deletes file, throws "session expired"                     |
| `anthropicToken()` throws when neither source exists | No env var, no OAuth file           | Throws "not authenticated"                                 |
| `writeOAuthCredential()` persists token              | Call with valid data                | File exists with correct JSON                              |
| `clearOAuthCredential()` removes file                | File exists                         | File absent after call                                     |
| `clearOAuthCredential()` no-ops if absent            | No file                             | No error                                                   |

Mock the `fetch` global for refresh tests (inject via constructor or
`globalThis` override in test scope).

## Files changed

| Action   | Path                                                     |
| -------- | -------------------------------------------------------- |
| Modified | `libraries/libconfig/src/config.js`                      |
| Created  | `libraries/libconfig/test/libconfig-credentials.test.js` |

## Verification

```bash
bun test libraries/libconfig/
bun run check
```

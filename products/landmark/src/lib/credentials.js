/**
 * Per-user credentials store for the Landmark CLI.
 *
 * Persists a Supabase session ({access_token, refresh_token, expires_at,
 * email}) at a per-platform location with 0600 permissions:
 *
 *   - $LANDMARK_CREDENTIALS_FILE                              (override)
 *   - $XDG_CONFIG_HOME/landmark/credentials.json              (XDG override)
 *   - %APPDATA%/landmark/credentials.json                     (Windows)
 *   - $HOME/Library/Application Support/landmark/             (macOS)
 *     credentials.json
 *   - $HOME/.config/landmark/credentials.json                 (Linux + other)
 *
 * No dependency on libconfig: that library's "config" bucket is rooted at
 * the codebase's config/ directory, which is right for internal contributors
 * but wrong for external `npx fit-landmark` users.
 *
 * Every function takes the injected `runtime` bag (its `fs` async surface and
 * `proc.env` / `proc.platform`) — the bin is the sole construction site
 * (design Decision 4). The credentials path resolution and IO never reach for
 * ambient `node:fs` or `process.*`.
 */

import path from "node:path";
import os from "node:os";

const FILE_NAME = "credentials.json";
const NAMESPACE = "landmark";

/**
 * Resolve the credentials file path with per-platform precedence.
 *
 * @param {object} runtime - The injected collaborator bag.
 * @param {NodeJS.ProcessEnv} [env] - Env map; defaults to `runtime.proc.env`.
 */
export function credentialsPath(runtime, env = runtime.proc.env) {
  if (env.LANDMARK_CREDENTIALS_FILE) return env.LANDMARK_CREDENTIALS_FILE;
  // XDG_CONFIG_HOME is honoured on every platform so a power user can
  // override the native default. It is set on Linux by default and
  // sometimes set on macOS by users running Homebrew-style configs.
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, NAMESPACE, FILE_NAME);
  const platform = runtime.proc.platform;
  if (platform === "win32" && env.APPDATA)
    return path.join(env.APPDATA, NAMESPACE, FILE_NAME);
  if (platform === "darwin")
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      NAMESPACE,
      FILE_NAME,
    );
  return path.join(os.homedir(), ".config", NAMESPACE, FILE_NAME);
}

/**
 * Read the persisted session; returns null when no file exists.
 *
 * @param {object} runtime - The injected collaborator bag.
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function readCredentials(runtime, env = runtime.proc.env) {
  const file = credentialsPath(runtime, env);
  try {
    const raw = await runtime.fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Persist the session. Always writes with 0600 so the access/refresh
 * tokens are owner-readable only.
 *
 * @param {object} runtime - The injected collaborator bag.
 * @param {{access_token:string, refresh_token:string, expires_at:number, email:string}} creds
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function writeCredentials(runtime, creds, env = runtime.proc.env) {
  const file = credentialsPath(runtime, env);
  await runtime.fs.mkdir(path.dirname(file), { recursive: true });
  const body = JSON.stringify(creds, null, 2);
  await runtime.fs.writeFile(file, body + "\n", { mode: 0o600 });
  // writeFile's mode only applies on creation; chmod covers the update path.
  if (runtime.proc.platform !== "win32") await runtime.fs.chmod(file, 0o600);
}

/**
 * Delete the persisted session; no-op if it does not exist.
 *
 * @param {object} runtime - The injected collaborator bag.
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function clearCredentials(runtime, env = runtime.proc.env) {
  const file = credentialsPath(runtime, env);
  try {
    await runtime.fs.rm(file);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

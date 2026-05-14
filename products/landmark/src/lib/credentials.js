/**
 * Per-user credentials store for the Landmark CLI.
 *
 * Persists a Supabase session ({access_token, refresh_token, expires_at,
 * email}) at an XDG-aware location with 0600 permissions:
 *
 *   - $XDG_CONFIG_HOME/landmark/credentials.json (if XDG_CONFIG_HOME is set)
 *   - $HOME/.config/landmark/credentials.json   (Linux / macOS default)
 *   - %APPDATA%/landmark/credentials.json       (Windows)
 *
 * The path is overridable via `$LANDMARK_CREDENTIALS_FILE` for tests and
 * uncommon deployments.
 *
 * No dependency on libconfig: that library's "config" bucket is rooted at
 * the codebase's config/ directory, which is right for internal contributors
 * but wrong for external `npx fit-landmark` users.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const FILE_NAME = "credentials.json";
const NAMESPACE = "landmark";

/** Resolve the credentials file path with XDG precedence. */
export function credentialsPath(env = process.env) {
  if (env.LANDMARK_CREDENTIALS_FILE) return env.LANDMARK_CREDENTIALS_FILE;
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, NAMESPACE, FILE_NAME);
  if (process.platform === "win32" && env.APPDATA)
    return path.join(env.APPDATA, NAMESPACE, FILE_NAME);
  return path.join(os.homedir(), ".config", NAMESPACE, FILE_NAME);
}

/** Read the persisted session; returns null when no file exists. */
export async function readCredentials(env = process.env) {
  const file = credentialsPath(env);
  try {
    const raw = await fs.readFile(file, "utf8");
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
 * @param {{access_token:string, refresh_token:string, expires_at:number, email:string}} creds
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function writeCredentials(creds, env = process.env) {
  const file = credentialsPath(env);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body = JSON.stringify(creds, null, 2);
  await fs.writeFile(file, body + "\n", { mode: 0o600 });
  // writeFile's mode only applies on creation; chmod covers the update path.
  if (process.platform !== "win32") await fs.chmod(file, 0o600);
}

/** Delete the persisted session; no-op if it does not exist. */
export async function clearCredentials(env = process.env) {
  const file = credentialsPath(env);
  try {
    await fs.unlink(file);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

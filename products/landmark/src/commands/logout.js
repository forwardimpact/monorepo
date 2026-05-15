/**
 * `fit-landmark logout` — delete the credentials store written by
 * `fit-landmark login`. A no-op when no session is present.
 */

import { formatSuccess } from "@forwardimpact/libcli";

import { clearCredentials, readCredentials } from "../lib/credentials.js";

export const needsSupabase = false;

/**
 * Run the logout command.
 *
 * @param {object} [params]
 * @param {{stdout?:NodeJS.WritableStream}} [params.io]
 * @param {NodeJS.ProcessEnv} [params.env]
 */
export async function runLogoutCommand({
  io = { stdout: process.stdout },
  env = process.env,
} = {}) {
  const creds = await readCredentials(env);
  if (!creds) {
    io.stdout.write("Already logged out.\n");
    return { meta: { ok: true }, summary: { previousEmail: null } };
  }
  await clearCredentials(env);
  io.stdout.write(formatSuccess(`Logged out ${creds.email}.`) + "\n");
  return { meta: { ok: true }, summary: { previousEmail: creds.email } };
}

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
 * @param {object} params
 * @param {object} params.runtime - The injected collaborator bag.
 * @param {{stdout?:{write:(s:string)=>unknown}}} [params.io] - Defaults to `runtime.proc`.
 * @param {NodeJS.ProcessEnv} [params.env] - Defaults to `runtime.proc.env`.
 */
export async function runLogoutCommand({
  runtime,
  io = runtime.proc,
  env = runtime.proc.env,
} = {}) {
  const creds = await readCredentials(runtime, env);
  if (!creds) {
    io.stdout.write("Already logged out.\n");
    return { meta: { ok: true }, summary: { previousEmail: null } };
  }
  await clearCredentials(runtime, env);
  io.stdout.write(formatSuccess(`Logged out ${creds.email}.`) + "\n");
  return { meta: { ok: true }, summary: { previousEmail: creds.email } };
}

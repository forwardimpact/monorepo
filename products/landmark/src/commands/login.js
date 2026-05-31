/**
 * `fit-landmark login` — sign an engineer in via Supabase magic-link.
 *
 * Two modes:
 *
 *   - Browser flow (default): start a localhost listener; ask Supabase to
 *     email a magic-link that redirects to the listener; capture the PKCE
 *     `code` query param; exchange it for a session.
 *
 *   - OTP flow (`--otp`): ask Supabase to email a 6-digit code; prompt
 *     for it on stdin; verify and persist the resulting session.
 *
 * Persistence lives in `products/landmark/src/lib/credentials.js`.
 */

import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";

import { formatSuccess, formatBullet } from "@forwardimpact/libcli";

import { writeCredentials } from "../lib/credentials.js";

export const needsSupabase = false;

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for the engineer to click.

function startCallbackServer() {
  let resolveCode, rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error_description");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Login failed: ${error}`);
      rejectCode(new Error(error));
      server.close();
      return;
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing `code` query parameter.");
      rejectCode(new Error("missing code"));
      server.close();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Login successful. You can close this tab.");
    server.close();
    resolveCode(code);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ port, codePromise, close: () => server.close() });
    });
  });
}

async function promptEmail(io) {
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    return (await rl.question("Email: ")).trim();
  } finally {
    rl.close();
  }
}

async function promptOtp(io) {
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    return (await rl.question("Code: ")).trim();
  } finally {
    rl.close();
  }
}

function persistSession(runtime, session, email, env) {
  return writeCredentials(
    runtime,
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: runtime.clock.now() + (session.expires_in ?? 3600) * 1000,
      email: session.user?.email ?? email,
    },
    env,
  );
}

// In-process storage for the PKCE code verifier. supabase-js writes the
// verifier here on `signInWithOtp` and reads it back on
// `exchangeCodeForSession` — both calls run inside the same CLI process,
// so a Map outlives the call sequence and dies when the process exits.
// `persistSession: false` plus `autoRefreshToken: false` keep the client
// from trying to write the session itself; we manage that via
// `writeCredentials` once exchange succeeds.
function createPkceStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function resolveAnonClient({ config, createClient, flowType = "implicit" }) {
  let url, anonKey;
  try {
    url = config.supabaseUrl();
    anonKey = config.supabaseAnonKey();
  } catch (err) {
    throw new Error(
      "fit-landmark login: SUPABASE_URL and SUPABASE_ANON_KEY must be set. " +
        "Run `just env-setup` (local) or copy them from your Supabase " +
        `project settings (hosted). Underlying: ${err.message}`,
    );
  }
  return createClient(url, anonKey, {
    auth: {
      flowType,
      storage: createPkceStorage(),
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Run the login command.
 *
 * @param {object} params
 * @param {object} params.runtime - The injected collaborator bag (clock, fs, proc).
 * @param {{email?:string, otp?:boolean}} params.options
 * @param {{stdin?:NodeJS.ReadableStream,stdout?:{write:(s:string)=>unknown}}} params.io
 *   stdout defaults to `runtime.proc`; stdin must be supplied by the bin (a
 *   real Readable for `readline`) when the command may prompt interactively.
 * @param {object} params.config - libconfig Config carrying Supabase URL + anon key.
 * @param {NodeJS.ProcessEnv} [params.env] - Carries LANDMARK_CREDENTIALS_FILE.
 * @param {(url:string,key:string)=>any} [params.createClient]
 * @param {() => Promise<{port:number,codePromise:Promise<string>,close:()=>void}>} [params.openListener]
 */
export async function runLoginCommand({
  runtime,
  options = {},
  io = { stdout: runtime.proc.stdout },
  config,
  env = runtime.proc.env,
  createClient,
  openListener = startCallbackServer,
} = {}) {
  if (!createClient) {
    ({ createClient } = await import("@supabase/supabase-js"));
  }

  const email = options.email ?? (await promptEmail(io));
  if (!email) throw new Error("fit-landmark login: email is required");

  if (options.otp) {
    const client = resolveAnonClient({ config, createClient });
    return runOtpFlow({ runtime, client, email, io, env });
  }
  // Browser flow needs PKCE so the magic-link redirect lands `?code=` (a
  // query param the localhost listener can read) rather than the default
  // implicit flow's `#access_token=...` URL fragment (which browsers strip
  // before sending the request — making it invisible to the listener).
  const client = resolveAnonClient({ config, createClient, flowType: "pkce" });
  return runBrowserFlow({ runtime, client, email, io, env, openListener });
}

async function runBrowserFlow({
  runtime,
  client,
  email,
  io,
  env,
  openListener,
}) {
  const { port, codePromise } = await openListener();
  const redirectTo = `http://127.0.0.1:${port}/cb`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) throw new Error(`signInWithOtp: ${error.message}`);

  io.stdout.write(
    "Sent a magic link to " +
      email +
      ".\nOpen the email on this machine and click the link — the CLI is " +
      "listening on 127.0.0.1:" +
      port +
      ".\n",
  );

  let timer;
  const timeoutPromise = new Promise((_, rej) => {
    timer = runtime.clock.setTimeout(
      () => rej(new Error("login timed out after 5 minutes")),
      DEFAULT_TIMEOUT_MS,
    );
  });
  let code;
  try {
    code = await Promise.race([codePromise, timeoutPromise]);
  } finally {
    // Clear so the timer doesn't fire after a fast successful login.
    runtime.clock.clearTimeout(timer);
  }

  const { data, error: exchErr } =
    await client.auth.exchangeCodeForSession(code);
  if (exchErr) throw new Error(`exchangeCodeForSession: ${exchErr.message}`);
  if (!data?.session)
    throw new Error("exchangeCodeForSession returned no session");

  await persistSession(runtime, data.session, email, env);
  io.stdout.write(
    formatSuccess(`Logged in as ${data.user?.email ?? email}.`) + "\n",
  );
  return { meta: { ok: true }, summary: { email: data.user?.email ?? email } };
}

async function runOtpFlow({ runtime, client, email, io, env }) {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(`signInWithOtp: ${error.message}`);
  io.stdout.write(
    formatBullet(`Sent a 6-digit code to ${email}. Paste it below.`, 0) + "\n",
  );

  const token = await promptOtp(io);
  if (!/^\d{6}$/.test(token)) {
    throw new Error("fit-landmark login: code must be 6 digits");
  }

  const { data, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (verifyErr) throw new Error(`verifyOtp: ${verifyErr.message}`);
  if (!data?.session) throw new Error("verifyOtp returned no session");

  await persistSession(runtime, data.session, email, env);
  io.stdout.write(
    formatSuccess(`Logged in as ${data.user?.email ?? email}.`) + "\n",
  );
  return { meta: { ok: true }, summary: { email: data.user?.email ?? email } };
}

#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { parseArgs } from "node:util";

const AUTH_TYPE = process.env.AUTH_TYPE;
const AUTH_URL = process.env.JWT_AUTH_URL || "http://localhost:9999";
const JWT_SECRET = process.env.JWT_SECRET;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Creates an HS256-signed JWT token for service role access
 * @param {string} secret - JWT signing secret
 * @returns {string} Signed JWT token
 */
function createServiceToken(secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "service_role",
    aud: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Gets the service role token for admin API access.
 * Uses AUTH_TYPE to determine which credentials to use.
 * @returns {{token: string, apikey: string|null}} Token and optional apikey header
 */
function getServiceCredentials() {
  if (!AUTH_TYPE) {
    console.error("Error: AUTH_TYPE not set");
    console.error("Run: make auth-user AUTH=gotrue  (or AUTH=supabase)");
    process.exit(1);
  }

  if (AUTH_TYPE === "supabase") {
    if (!SERVICE_ROLE_KEY) {
      console.error("Error: SUPABASE_SERVICE_ROLE_KEY not set");
      console.error("Run: make env-storage STORAGE=supabase");
      process.exit(1);
    }
    return { token: SERVICE_ROLE_KEY, apikey: SERVICE_ROLE_KEY };
  }

  // gotrue or other: generate token from JWT_SECRET
  if (!JWT_SECRET) {
    console.error("Error: JWT_SECRET not set");
    console.error("Run: make env-secrets");
    process.exit(1);
  }
  return { token: createServiceToken(JWT_SECRET), apikey: null };
}

/**
 * Creates a demo user via GoTrue/Supabase Auth admin API
 */
async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string", default: "demo@example.com" },
      password: { type: "string", default: "demo123456" },
    },
  });

  const { email, password } = values;
  const { token, apikey } = getServiceCredentials();

  console.log(`Creating demo user: ${email}`);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Supabase requires apikey header
  if (apikey) {
    headers.apikey = apikey;
  }

  const response = await fetch(`${AUTH_URL}/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: "Demo User",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.msg?.includes("already been registered")) {
      console.log("User already exists, skipping creation");
      return;
    }
    console.error(`Failed to create user: ${JSON.stringify(error)}`);
    process.exit(1);
  }

  const user = await response.json();
  console.log(`Created user: ${user.id}`);
  console.log(`\nDemo credentials:`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
}

main();

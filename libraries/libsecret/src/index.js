import crypto from "crypto";
import path from "path";

/**
 * Reads an environment variable value from an env file
 * @param {string} key - Environment variable name
 * @param {string} [envPath] - Path to .env file (defaults to .env in current directory)
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {Promise<string|undefined>} The value if found, undefined otherwise
 */
export async function readEnvFile(key, envPath = ".env", runtime) {
  const { fs } = runtime;
  const fullPath = path.resolve(envPath);

  try {
    const content = await fs.readFile(fullPath, "utf8");
    const lines = content.split("\n");

    for (const line of lines) {
      // Match active (non-commented) key=value pairs
      if (line.startsWith(`${key}=`)) {
        return line.slice(key.length + 1);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return undefined;
}

/**
 * Gets an existing secret from env file or generates a new one
 * @param {string} key - Environment variable name
 * @param {() => string} generator - Function that generates the secret if not found
 * @param {string} [envPath] - Path to .env file (defaults to .env in current directory)
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {Promise<string>} The existing or newly generated secret
 */
export async function getOrGenerateSecret(
  key,
  generator,
  envPath = ".env",
  runtime,
) {
  if (typeof generator !== "function") {
    throw new Error("generator is required");
  }

  const existing = await readEnvFile(key, envPath, runtime);
  if (existing) {
    return existing;
  }

  return generator();
}

/**
 * Updates or creates an environment variable in .env file
 * @param {string} key - Environment variable name (e.g., "SERVICE_SECRET")
 * @param {string} value - Environment variable value
 * @param {string} [envPath] - Path to .env file (defaults to .env in current directory)
 * @param {object} [runtime] - Runtime collaborator bag
 */
export async function updateEnvFile(key, value, envPath = ".env", runtime) {
  const { fs } = runtime;
  const fullPath = path.resolve(envPath);
  let content = "";

  try {
    content = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    // It's ok if the file doesn't exist
    if (error.code !== "ENOENT") throw error;
  }

  const envLine = `${key}=${value}`;
  const lines = content.split("\n");
  let found = false;

  // Look for existing key line (both active and commented)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`) || lines[i].startsWith(`# ${key}=`)) {
      lines[i] = envLine;
      found = true;
      break;
    }
  }

  // If not found, add it to the end
  if (!found) {
    if (content && !content.endsWith("\n")) {
      lines.push("");
    }
    lines.push(envLine);
  }

  // Write back to file — ensure trailing newline for POSIX compatibility,
  // and enforce 0o600 since this file holds secrets. writeFile's `mode`
  // applies only on creation; chmod also covers the update path.
  const output = lines.join("\n");
  await fs.writeFile(fullPath, output.endsWith("\n") ? output : output + "\n", {
    mode: 0o600,
  });
  await fs.chmod(fullPath, 0o600);
}

/**
 * Generates a deterministic hash from multiple input values
 * @param {...string} values - Values to hash together
 * @returns {string} The first 8 characters of SHA256 hash
 */
export function generateHash(...values) {
  const input = values.filter(Boolean).join(".");
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("hex")
    .substring(0, 8);
}

/**
 * Generates a unique identifier using crypto.randomUUID
 * @returns {string} Unique identifier
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Generates a cryptographically secure random secret
 * @param {number} [length] - Length of the secret in bytes (default: 32)
 * @returns {string} Hex-encoded random secret
 */
export function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generates a base64url-encoded random secret
 * @param {number} [length] - Length in bytes (default: 32)
 * @returns {string} Base64url-encoded string
 */
export function generateBase64Secret(length = 32) {
  return crypto.randomBytes(length).toString("base64url");
}

/**
 * Creates an HS256-signed JWT
 * @param {object} payload - JWT payload
 * @param {string} secret - Signing secret
 * @returns {string} Signed JWT
 */
export function generateJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Mint a Supabase-shaped HS256 JWT. Wraps generateJWT with the standard
 * claims Supabase Auth expects on a caller token.
 *
 * @param {object} params
 * @param {string} params.email - Caller email, becomes the `email` claim
 * @param {string} params.secret - Supabase JWT secret (HMAC key)
 * @param {number} [params.ttlSeconds] - Token lifetime in seconds
 * @param {object} [params.claims] - Extra claims merged into the payload
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {string} Signed JWT
 */
export function mintSupabaseJwt(
  { email, secret, ttlSeconds = 3600, claims = {} },
  runtime,
) {
  const { clock } = runtime;
  if (!secret) throw new Error("mintSupabaseJwt: secret required");
  if (!email) throw new Error("mintSupabaseJwt: email required");
  const now = Math.floor(clock.now() / 1000);
  return generateJWT(
    {
      role: "authenticated",
      aud: "authenticated",
      email,
      sub: crypto.randomUUID(),
      iss: "supabase",
      iat: now,
      exp: now + ttlSeconds,
      ...claims,
    },
    secret,
  );
}

const SUPABASE_ROLE_EXP_SECONDS = 10 * 365 * 24 * 60 * 60;

function mintSupabaseRoleKey({ role, secret }, runtime) {
  const { clock } = runtime;
  if (!secret) {
    throw new Error(
      `mintSupabase${role === "anon" ? "Anon" : "ServiceRole"}Key: secret required`,
    );
  }
  const now = Math.floor(clock.now() / 1000);
  return generateJWT(
    { iss: "supabase", iat: now, exp: now + SUPABASE_ROLE_EXP_SECONDS, role },
    secret,
  );
}

/**
 * Mint a long-lived Supabase anon-role HS256 JWT, used by the local
 * Supabase stack and by anon Supabase clients.
 *
 * @param {object} params
 * @param {string} params.secret - Supabase JWT secret (HMAC key)
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {string} Signed JWT
 */
export function mintSupabaseAnonKey({ secret }, runtime) {
  return mintSupabaseRoleKey({ role: "anon", secret }, runtime);
}

/**
 * Mint a long-lived Supabase service-role HS256 JWT, used for admin
 * operations against the local Supabase stack.
 *
 * @param {object} params
 * @param {string} params.secret - Supabase JWT secret (HMAC key)
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {string} Signed JWT
 */
export function mintSupabaseServiceRoleKey({ secret }, runtime) {
  return mintSupabaseRoleKey({ role: "service_role", secret }, runtime);
}

/**
 * Parse a duration string like "8760h", "365d", or "1y" into seconds.
 * Accepted suffixes: h (hours), d (days, 86400s), y (years, 31536000s).
 *
 * @param {string} value
 * @returns {number}
 */
export function parseDuration(value) {
  const match = /^(\d+)([hdy])$/.exec(value);
  if (!match) throw new Error(`parseDuration: invalid duration "${value}"`);
  const n = Number(match[1]);
  if (match[2] === "h") return n * 3600;
  if (match[2] === "d") return n * 86400;
  return n * 31536000;
}

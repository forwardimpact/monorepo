import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

/**
 * Reads an environment variable value from an env file
 * @param {string} key - Environment variable name
 * @param {string} [envPath] - Path to .env file (defaults to .env in current directory)
 * @returns {Promise<string|undefined>} The value if found, undefined otherwise
 */
export async function readEnvFile(key, envPath = ".env") {
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
 * @returns {Promise<string>} The existing or newly generated secret
 */
export async function getOrGenerateSecret(key, generator, envPath = ".env") {
  if (typeof generator !== "function") {
    throw new Error("generator is required");
  }

  const existing = await readEnvFile(key, envPath);
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
 */
export async function updateEnvFile(key, value, envPath = ".env") {
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

  // Write back to file
  await fs.writeFile(fullPath, lines.join("\n"));
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

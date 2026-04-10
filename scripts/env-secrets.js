#!/usr/bin/env bun
import {
  generateJWT,
  generateSecret,
  getOrGenerateSecret,
  updateEnvFile,
} from "@forwardimpact/libsecret";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/**
 * Main function to generate and update secrets
 *
 * Usage:
 * env-secrets.js                             # Updates .env file
 * env-secrets.js --output $PATH              # Writes key=value pairs to file
 * env-secrets.js --add-mask --output $PATH   # Prints mask commands and writes to file
 */
async function main() {
  const { values } = parseArgs({
    options: {
      output: {
        type: "string",
      },
      "add-mask": {
        type: "boolean",
        default: false,
      },
    },
  });

  const serviceSecret = generateSecret();
  const jwtSecret = await getOrGenerateSecret("JWT_SECRET", () =>
    generateSecret(32),
  );
  const databasePassword = generateSecret(16);

  // JWT anonymous key: 10 years expiration
  const jwtAnonKey = generateJWT(
    {
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
      role: "anon",
    },
    jwtSecret,
  );

  // Map Supabase service-role key for local development.
  // Local Supabase uses a hardcoded demo JWT secret (not our JWT_SECRET).
  // For hosted deployments, users override MAP_SUPABASE_SERVICE_ROLE_KEY
  // with a key signed against their project's JWT secret.
  const SUPABASE_DEMO_JWT_SECRET =
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const mapServiceRoleKey = generateJWT(
    {
      iss: "supabase-demo",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
      role: "service_role",
    },
    SUPABASE_DEMO_JWT_SECRET,
  );

  if (values.output) {
    // Write key=value pairs to output file
    const content = `service_secret=${serviceSecret}\njwt_secret=${jwtSecret}\njwt_anon_key=${jwtAnonKey}\ndatabase_password=${databasePassword}\nmap_supabase_service_role_key=${mapServiceRoleKey}\n`;
    await writeFile(values.output, content);

    if (values["add-mask"]) {
      // Print GitHub Actions mask commands to stdout
      console.log(`::add-mask::${serviceSecret}`);
      console.log(`::add-mask::${jwtSecret}`);
      console.log(`::add-mask::${jwtAnonKey}`);
      console.log(`::add-mask::${databasePassword}`);
      console.log(`::add-mask::${mapServiceRoleKey}`);
    }
    return;
  }

  // Default: update .env file
  await updateEnvFile("SERVICE_SECRET", serviceSecret);
  await updateEnvFile("JWT_SECRET", jwtSecret);
  await updateEnvFile("JWT_ANON_KEY", jwtAnonKey);
  await updateEnvFile("DATABASE_PASSWORD", databasePassword);
  await updateEnvFile("MAP_SUPABASE_SERVICE_ROLE_KEY", mapServiceRoleKey);

  console.log("SERVICE_SECRET was updated in .env");
  console.log("JWT_SECRET is set in .env");
  console.log("JWT_ANON_KEY was updated in .env");
  console.log("DATABASE_PASSWORD was updated in .env");
  console.log("MAP_SUPABASE_SERVICE_ROLE_KEY was updated in .env");
}

main();

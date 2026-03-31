#!/usr/bin/env bun
import { updateEnvFile } from "@forwardimpact/libsecret";
import { createInterface } from "node:readline";

/**
 * GitHub token setup utility.
 *
 * Prompts for a GitHub PAT with `models` scope and saves it to .env.
 * The token is used for GitHub Models API access.
 *
 * To create a token:
 *   1. Visit https://github.com/settings/tokens
 *   2. Generate a fine-grained PAT with the `models` scope
 *   3. Paste the token when prompted
 */
async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  // If stdin is piped, read token directly
  if (!process.stdin.isTTY) {
    let token = "";
    for await (const line of rl) {
      token += line.trim();
    }
    if (token) {
      await updateEnvFile("LLM_TOKEN", token);
      console.log("LLM_TOKEN was updated in .env");
    }
    return;
  }

  const token = await new Promise((resolve) => {
    rl.question("Paste your GitHub PAT (models scope): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!token) {
    console.error("No token provided");
    process.exit(1);
  }

  await updateEnvFile("LLM_TOKEN", token);
  console.log("LLM_TOKEN was updated in .env");
}

main();

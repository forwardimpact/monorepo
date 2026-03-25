#!/usr/bin/env node
import { countTokens } from "@forwardimpact/libutil";

/**
 * Counts tokens in the provided text
 * Usage: fit-tiktoken <text>
 *        echo "text" | fit-tiktoken
 * @returns {Promise<void>}
 */
async function main() {
  let text = process.argv.slice(2).join(" ");

  if (!text && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString().trim();
  }

  if (!text) {
    console.error("Usage: fit-tiktoken <text>");
    console.error('       echo "text" | fit-tiktoken');
    process.exit(1);
  }

  console.log(countTokens(text));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

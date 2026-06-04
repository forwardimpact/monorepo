// Deliberate BYOK-boundary violation fixture. Read only by
// check-byok-boundary.test.js to prove the scanner flags a breach. This file
// is intentionally excluded from lint/format/build and is never imported.
import Anthropic from "@anthropic-ai/sdk";

const key = process.env.ANTHROPIC_API_KEY;
// Single-quoted bracket access — broadened regex must catch this too.
const alt = process.env["ANTHROPIC_BASE_URL"];
// Destructuring read of an ANTHROPIC_-prefixed name must trip the scanner.
const { ANTHROPIC_MODEL } = process.env;

export const client = new Anthropic({ apiKey: key, alt, model: ANTHROPIC_MODEL });

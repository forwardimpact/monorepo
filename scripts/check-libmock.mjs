#!/usr/bin/env node
// Flag test files that inline a mock/fixture helper already available in
// libmock. Called from `bun run check`. Detection rules live in
// check-libmock-rules.mjs so a regression test can exercise them directly.

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { libmockFindings } from "./check-libmock-rules.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
let status = 0;
const fail = (msg) => {
  console.error(`error: ${msg}`);
  status = 1;
};

const files = execSync(
  "find ./libraries ./products ./services ./tests -name '*.test.js' -not -path '*/node_modules/*'",
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

for (const file of files) {
  // libmock's own self-tests are expected to redefine some helpers.
  if (file.startsWith("./libraries/libmock/")) continue;
  // The guard's own regression test embeds the very inline shapes it detects.
  if (file.endsWith("/check-libmock-rules.test.js")) continue;

  const text = await readFile(resolve(root, file), "utf8");
  for (const finding of libmockFindings(text)) {
    fail(`${file}: ${finding}`);
  }
}

process.exit(status);

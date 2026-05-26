#!/usr/bin/env node
// Flag test files that inline a mock/fixture helper already available in
// libharness. Called from `bun run check`.

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

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
  // libharness's own self-tests are expected to redefine some helpers.
  if (file.startsWith("./libraries/libharness/")) continue;

  const text = await readFile(resolve(root, file), "utf8");
  const imports = /from\s+["']@forwardimpact\/libharness["']/.test(text);

  // Simple inline patterns that libharness already covers.
  const findings = [];
  if (
    /function\s+(concludeMsg|redirectMsg|tellMsg|shareMsg)\s*\(/.test(text) &&
    !text.includes("createToolUseMsg")
  ) {
    findings.push(
      "inline concludeMsg/redirectMsg/tellMsg/shareMsg — use createToolUseMsg",
    );
  }
  if (
    /function\s+stripAnsi\s*\(/.test(text) &&
    !text.includes("stripAnsi }") &&
    !/from\s+["']@forwardimpact\/libharness["']/.test(text)
  ) {
    findings.push("inline stripAnsi — use libharness stripAnsi");
  }
  if (
    /const\s+mockLogger\s*=\s*\{\s*(info|debug|warn|error)/.test(text) &&
    !text.includes("createMockLogger") &&
    !text.includes("createSilentLogger")
  ) {
    findings.push("inline mockLogger object — use createSilentLogger");
  }
  // class MockStorage verbatim is easy to spot, but `function createMockStorage`
  // may be an extension with extra methods. Only flag when there's no
  // libharness import at all.
  if (/class\s+MockStorage\b/.test(text) && !imports) {
    findings.push("inline class MockStorage — use createMockStorage");
  }
  // mock.fn from node:test is not portable to bun test. Use spy() from
  // libharness instead.
  if (/\bmock\.fn\s*\(/.test(text)) {
    findings.push(
      "mock.fn from node:test is not bun-compatible — use spy from libharness",
    );
  }
  // Callback-style test signatures (test("...", (_, done) => {...})) don't
  // work under bun test. Convert to async.
  if (/\btest\s*\([^,)]*,\s*\([^)]*,\s*done\s*\)/.test(text)) {
    findings.push(
      "test(..., (_, done) => …) is not bun-compatible — rewrite as async",
    );
  }

  for (const finding of findings) {
    fail(`${file}: ${finding}`);
  }
}

process.exit(status);

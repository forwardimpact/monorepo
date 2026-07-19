// Shared support for the hidden --filter feature checks. Staged beside them
// by the harness; not a check itself (no .test.js suffix). Verifies the
// --filter feature from spec 042 without the agent ever seeing the asserts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const appDir = dirname(dirname(fileURLToPath(import.meta.url))); // app/
export const bin = join(appDir, "bin", "todo.js");
export const store = await import(join(appDir, "src", "store.js"));

export const sample = [
  { id: 1, text: "Buy milk", done: false },
  { id: 2, text: "Walk the dog", done: false },
  { id: 3, text: "Buy stamps", done: false },
];

export function runList(args, todos) {
  const dir = mkdtempSync(join(tmpdir(), "todo-"));
  const file = join(dir, "todos.json");
  writeFileSync(file, JSON.stringify(todos));
  try {
    return execFileSync("node", [bin, "list", ...args], {
      env: { ...process.env, TODO_FILE: file },
      encoding: "utf8",
    }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

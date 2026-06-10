// HIDDEN feature test for the implement-feature benchmark task.
// Lives under hooks/ (never copied into the agent CWD); invariants.sh copies it
// into app/test/ AFTER the agent has run, then executes the suite. It verifies
// the --filter feature from spec 042 without the agent ever seeing these asserts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url))); // app/
const bin = join(appDir, "bin", "todo.js");
const store = await import(join(appDir, "src", "store.js"));

function runList(args, todos) {
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

const sample = [
  { id: 1, text: "Buy milk", done: false },
  { id: 2, text: "Walk the dog", done: false },
  { id: 3, text: "Buy stamps", done: false },
];

describe("--filter feature", () => {
  test("filterTodos selects matching todos", () => {
    assert.equal(store.filterTodos(sample, "buy").length, 2);
  });

  test("filterTodos is case-insensitive", () => {
    assert.equal(store.filterTodos(sample, "DOG").length, 1);
    assert.equal(store.filterTodos(sample, "dog")[0].text, "Walk the dog");
  });

  test("filterTodos returns nothing when no match", () => {
    assert.deepEqual(store.filterTodos(sample, "zzz"), []);
  });

  test("list --filter prints only matching lines", () => {
    const out = runList(["--filter", "buy"], sample);
    assert.match(out, /Buy milk/);
    assert.match(out, /Buy stamps/);
    assert.doesNotMatch(out, /Walk the dog/);
  });

  test("list with no filter prints everything", () => {
    const out = runList([], sample);
    assert.equal(out.split("\n").filter(Boolean).length, 3);
  });
});

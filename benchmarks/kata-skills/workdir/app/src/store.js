// Pure todo-store logic for the mock benchmark app. Zero dependencies —
// node: built-ins only — so the fixture runs with no install step.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** Resolve the store path from $TODO_FILE, falling back to ./todos.json. */
export function storePath(env = process.env) {
  return env.TODO_FILE || "todos.json";
}

/** Load todos from disk. Returns [] when the store does not exist yet. */
export function load(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

/** Persist todos to disk as pretty JSON. */
export function save(path, todos) {
  writeFileSync(path, `${JSON.stringify(todos, null, 2)}\n`);
}

/** Append a todo with the next sequential id. Returns the created todo. */
export function addTodo(todos, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("todo text must not be empty");
  const id = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const todo = { id, text: trimmed, done: false };
  todos.push(todo);
  return todo;
}

/** Mark the todo with the given id complete. Throws if no such id. */
export function completeTodo(todos, id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw new Error(`no todo with id ${id}`);
  todo.done = true;
  return todo;
}

/** Render a single todo as a list line, e.g. "[ ] 1 buy milk". */
export function formatTodo(todo) {
  return `[${todo.done ? "x" : " "}] ${todo.id} ${todo.text}`;
}

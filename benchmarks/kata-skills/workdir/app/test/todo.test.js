// Baseline behaviour tests — the regression surface the implement task must
// keep green. The new --filter feature is covered by a hidden test, not here.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { addTodo, completeTodo, formatTodo } from "../src/store.js";

describe("store", () => {
  let todos;
  beforeEach(() => {
    todos = [];
  });

  test("addTodo assigns sequential ids", () => {
    assert.equal(addTodo(todos, "a").id, 1);
    assert.equal(addTodo(todos, "b").id, 2);
    assert.equal(todos.length, 2);
  });

  test("addTodo rejects empty text", () => {
    assert.throws(() => addTodo(todos, "   "), /must not be empty/);
  });

  test("completeTodo marks done and throws on missing id", () => {
    addTodo(todos, "a");
    assert.equal(completeTodo(todos, 1).done, true);
    assert.throws(() => completeTodo(todos, 99), /no todo with id 99/);
  });

  test("formatTodo renders the list line", () => {
    addTodo(todos, "buy milk");
    assert.equal(formatTodo(todos[0]), "[ ] 1 buy milk");
    completeTodo(todos, 1);
    assert.equal(formatTodo(todos[0]), "[x] 1 buy milk");
  });
});
